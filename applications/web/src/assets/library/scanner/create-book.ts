import { readdir, rm } from "node:fs/promises"
import { basename, extname, join } from "node:path"

import {
  Audiobook,
  type AudiobookInputs,
} from "@storyteller-platform/audiobook"
import {
  Epub,
  type EpubReader,
  type InMemoryEpubReader,
  MemoryAdapter,
} from "@storyteller-platform/epub"

import { move } from "@/assets/fs"
import { type PipelineCtx, type ScanCtx } from "@/assets/library/scanner/ctx"
import { type Candidate } from "@/assets/library/scanner/types"
import { isAudioFile, isHiddenFile } from "@/audio"
import {
  type BookWithRelations,
  createBookFromAudiobook,
  createBookFromEpub,
} from "@/database/books"
import { addBooksToCollections } from "@/database/collections"
import {
  addIgnoreRule,
  removeImportBackupIgnoreRule,
} from "@/database/importRules"
import { getSetting } from "@/database/settings"
import {
  type Epub2ImportStrategy,
  renderEpubSuffix,
} from "@/database/settingsTypes"
import { isEpubVersionError } from "@/epub"
import { logger } from "@/logging"
import { type UUID } from "@/uuid"

export async function isReadaloudEpub(epub: EpubReader): Promise<boolean> {
  const manifest = await epub.getManifest()
  return Object.values(manifest).some((item) => item.mediaOverlay)
}

async function resolveEpub2Strategy(
  override: Epub2ImportStrategy | undefined,
): Promise<{ strategy: Epub2ImportStrategy; suffixTemplate: string }> {
  if (override) {
    // the suffix is irrelevant unless the strategy writes a second file, but
    // keep the read so callers don't need to special-case it.
    const suffixTemplate = await getSetting("epub2BackupSuffix")
    return { strategy: override, suffixTemplate }
  }
  const [strategy, suffixTemplate] = await Promise.all([
    getSetting("epub2ImportStrategy"),
    getSetting("epub2BackupSuffix"),
  ])
  return { strategy, suffixTemplate }
}

export type OpenOrUpgradeResult = {
  reader: InMemoryEpubReader
  /** path where the usable epub3 file lives on disk (may differ from input
   *  when the upgrade wrote to a separate writable location) */
  effectivePath: string
}

function suffixedEpubPath(filepath: string, suffix: string): string {
  return /\.epub$/i.test(filepath)
    ? filepath.replace(/\.epub$/i, `${suffix}.epub`)
    : `${filepath}${suffix}`
}

async function upgradeToPath(
  sourcePath: string,
  outputPath: string,
): Promise<void> {
  using upgraded = await Epub.upgrade(sourcePath, {
    ...(outputPath !== sourcePath && { outputPath }),
  })
  await upgraded.saveAndClose()
}

/**
 * Returns a reader for an EPUB 3 file at `filepath`, upgrading from EPUB 2 if
 * needed according to the resolved strategy.
 *
 * `strategyOverride` forces upgraded path to be written to `upgradeTo`.
 * needed for `copy` mode
 *
 */
export async function openOrUpgradeEpub(
  filepath: string,
  epub2ImportStrategy?: Epub2ImportStrategy,
  upgradeTo?: string,
): Promise<OpenOrUpgradeResult> {
  try {
    const reader = await Epub.using(MemoryAdapter).from(filepath)
    return { reader, effectivePath: filepath }
  } catch (error) {
    if (!isEpubVersionError(error)) throw error

    const { strategy, suffixTemplate } =
      await resolveEpub2Strategy(epub2ImportStrategy)

    if (strategy === "skip") throw error

    // backup-and-convert: move the source to a backup path, then upgrade from
    // backup to the original location. only valid for non-copy modes
    if (strategy === "backup-and-convert" && !upgradeTo) {
      const backupPath = suffixedEpubPath(
        filepath,
        renderEpubSuffix(suffixTemplate, 2),
      )
      await addIgnoreRule(backupPath, { source: "import-backup" })
      await move(filepath, backupPath)
      try {
        await upgradeToPath(backupPath, filepath)
      } catch (upgradeError) {
        await rm(filepath, { force: true })
        await move(backupPath, filepath)
        await removeImportBackupIgnoreRule(backupPath)
        throw upgradeError
      }

      const reader = await Epub.using(MemoryAdapter).from(filepath)
      return { reader, effectivePath: filepath }
    }

    if (strategy === "convert-alongside" && !upgradeTo) {
      const convertedPath = suffixedEpubPath(
        filepath,
        renderEpubSuffix(suffixTemplate, 3),
      )
      // ignore the original file as a backup
      await addIgnoreRule(filepath, { source: "import-backup" })
      // once bitten twice shy
      // this should be handled by the upgradeToPath function, but...
      try {
        await upgradeToPath(filepath, convertedPath)
      } catch (upgradeError) {
        await rm(convertedPath, { force: true })
        await removeImportBackupIgnoreRule(filepath)
        throw upgradeError
      }

      const reader = await Epub.using(MemoryAdapter).from(convertedPath)
      return { reader, effectivePath: convertedPath }
    }

    // "replace": upgrade in place, or write to upgradeTo when the source must
    // remain untouched (copy mode).
    const outputPath = upgradeTo ?? filepath
    try {
      await upgradeToPath(filepath, outputPath)
    } catch (upgradeError) {
      if (upgradeTo) {
        await rm(upgradeTo, { force: true })
      }
      throw upgradeError
    }

    const reader = await Epub.using(MemoryAdapter).from(outputPath)
    return { reader, effectivePath: outputPath }
  }
}

export type OpenEpubOpts = {
  /** override the candidate's epub2ImportStrategy */
  strategyOverride?: Epub2ImportStrategy
  /** writable path for the upgrade output when the source must stay untouched */
  upgradeTo?: string
}

export type OpenedAudiobookResult = {
  audiobook: Audiobook
}

/**
 * registers the opened audiobook on ctx.scope so it's disposed at end of
 * pipeline. downstream pipeline steps reuse it instead of re-opening.
 */
export async function openAudiobookDir(
  candidate: Candidate,
  ctx: PipelineCtx,
): Promise<OpenedAudiobookResult | null> {
  let tracks: AudiobookInputs
  try {
    const entries = await readdir(candidate.filepath, { recursive: true })
    tracks = entries
      .filter((entry) => isAudioFile(entry) && !isHiddenFile(entry))
      .map((entry) => join(candidate.filepath, entry)) as AudiobookInputs
  } catch (error) {
    ctx.report.warn({
      step: "open-audiobook",
      msg: `Failed to read audiobook directory ${candidate.filepath}; skipping`,
      err: error,
    })
    return null
  }

  if (tracks.length === 0) return null

  let audiobook: Audiobook
  try {
    audiobook = ctx.scope.use(await Audiobook.from(...tracks))
  } catch (error) {
    ctx.report.warn({
      step: "open-audiobook",
      msg: `Failed to open audiobook at ${candidate.filepath}; skipping`,
      err: error,
    })
    return null
  }

  return { audiobook }
}

export async function createBookFromOpenedEpub(
  candidate: Candidate,
  epub: InMemoryEpubReader,
  format: "ebook" | "readaloud",
  ctx: ScanCtx,
): Promise<BookWithRelations | null> {
  const fallbackTitle =
    candidate.titleHint ?? basename(candidate.filepath, ".epub")

  let book: BookWithRelations
  try {
    book = await createBookFromEpub(
      epub,
      {
        ...(candidate.bookUuidHint && { uuid: candidate.bookUuidHint }),
        title: fallbackTitle,
      },
      format === "readaloud"
        ? {
            readaloud: {
              filepath: candidate.filepath,
              status: "ALIGNED",
              currentStage: "SPLIT_TRACKS",
            },
            ...(candidate.collections?.length && {
              collections: candidate.collections,
            }),
          }
        : {
            ebook: { filepath: candidate.filepath },
            ...(candidate.collections?.length && {
              collections: candidate.collections,
            }),
          },
    )
  } catch (error) {
    ctx.report.warn({
      step: "create-book",
      msg: `Failed to create book for ${candidate.filepath}`,
      err: error,
    })
    return null
  }

  ctx.report.recordAdded(book.uuid, book.title)
  logger.info({
    msg: `Created book ${book.title} (${book.uuid}) from ${candidate.filepath}`,
  })
  return book
}

export async function createBookFromOpenedAudiobook(
  candidate: Candidate,
  opened: OpenedAudiobookResult,
  ctx: ScanCtx,
): Promise<BookWithRelations | null> {
  const fallbackTitle =
    candidate.titleHint ??
    basename(candidate.filepath, extname(candidate.filepath))

  let book: BookWithRelations
  try {
    book = await createBookFromAudiobook(
      opened.audiobook,
      {
        ...(candidate.bookUuidHint && { uuid: candidate.bookUuidHint }),
        title: fallbackTitle,
      },
      {
        audiobook: { filepath: candidate.filepath },
        ...(candidate.collections?.length && {
          collections: candidate.collections,
        }),
      },
    )
  } catch (error) {
    ctx.report.warn({
      step: "create-book",
      msg: `Failed to create book for ${candidate.filepath}`,
      err: error,
    })
    return null
  }

  ctx.report.recordAdded(book.uuid, book.title)
  logger.info({
    msg: `Created book ${book.title} (${book.uuid}) from ${candidate.filepath}`,
  })
  return book
}

/**
 * Add the book to any candidate collections it isn't already in. Used when
 * find-book returns an existing book that came from outside the current
 * scope (overlapping watch roots).
 */
export async function ensureCollections(
  book: BookWithRelations,
  collectionUuids: UUID[] | undefined,
): Promise<void> {
  if (!collectionUuids?.length) return
  const missing = collectionUuids.filter(
    (uuid) => !book.collections.some((c) => c.uuid === uuid),
  )
  if (!missing.length) return
  await addBooksToCollections(missing, [book.uuid])
}
