import { type Dirent } from "node:fs"
import { readdir, realpath } from "node:fs/promises"
import { extname, join, resolve, sep } from "node:path"

import { Epub, MemoryAdapter } from "@storyteller-platform/epub"

import { isInsideInternalDirectory } from "@/assets/library/internalDirs"
import { isReadaloudEpub } from "@/assets/library/scanner/create-book"
import { isAudioFile, isHiddenFile } from "@/audio"
import { type BookWithRelations } from "@/database/books"
import { getIgnorePaths } from "@/database/importRules"
import { getSetting } from "@/database/settings"
import {
  type Epub2ImportStrategy,
  type ImportMode,
} from "@/database/settingsTypes"
import { isEpubVersionError } from "@/epub"
import { logger } from "@/logging"

import { type ScanCtx } from "./ctx"
import { type Candidate } from "./types"

/** Resolve symlinks/relative paths to a single canonical form. */
export async function canonicalizePath(p: string): Promise<string> {
  try {
    return await realpath(p)
  } catch {
    return resolve(p)
  }
}

function isENOENT(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

type FolderClassification = {
  regularEpubs: string[]
  readaloudEpubs: string[]
  audiobookDir: string | null
}

async function classifyFolder(
  folder: string,
  opts: { epub2BackupSuffix: string; ignorePaths: string[] },
): Promise<FolderClassification | null> {
  let entries: Dirent[]
  try {
    entries = await readdir(folder, { withFileTypes: true })
  } catch (error) {
    if (isENOENT(error)) return null
    throw error
  }

  const epubPaths: string[] = []
  let hasAudio = false

  for (const entry of entries) {
    if (!entry.isFile() && !entry.isSymbolicLink()) continue

    const name = entry.name
    if (isHiddenFile(name)) continue
    const fullPath = join(folder, name)

    const isInIgnorePath = Array.from(opts.ignorePaths).some((path) =>
      pathBelongsTo(path, fullPath),
    )
    if (isInIgnorePath) continue

    const ext = extname(name)
    if (ext === ".epub") {
      if (name.endsWith(`${opts.epub2BackupSuffix}.epub`)) continue
      epubPaths.push(fullPath)
    } else if (isAudioFile(ext)) {
      hasAudio = true
    }
  }

  const regularEpubs: string[] = []
  const readaloudEpubs: string[] = []
  for (const epubPath of epubPaths) {
    let aligned = false
    try {
      using epub = await Epub.using(MemoryAdapter).from(epubPath)
      aligned = await isReadaloudEpub(epub)
    } catch (error) {
      if (isEpubVersionError(error)) {
        logger.warn({
          msg: "Can't classify epub as readaloud or regular ebook because it is an EPUB 2 file, treating as regular and continuing",
          epubPath,
        })
      } else {
        logger.warn({
          msg: "Failed to classify epub as readaloud or regular ebook during folder scan; treating as regular",
          epubPath,
          err: error,
        })
      }
    }
    if (aligned) readaloudEpubs.push(epubPath)
    else regularEpubs.push(epubPath)
  }

  return {
    regularEpubs,
    readaloudEpubs,
    audiobookDir: hasAudio ? folder : null,
  }
}

export function pathBelongsTo(folder: string, candidatePath: string): boolean {
  const f = resolve(folder)
  const p = resolve(candidatePath)
  return p === f || p.startsWith(f + sep)
}

function booksReferencingFolder(
  folder: string,
  books: BookWithRelations[],
): BookWithRelations[] {
  return books.filter((book) => {
    const paths = [
      book.ebook?.filepath,
      book.audiobook?.filepath,
      book.readaloud?.filepath,
    ].filter((p): p is string => !!p)
    return paths.some((p) => pathBelongsTo(folder, p))
  })
}

function candidateFromExistingBook(
  folder: string,
  book: BookWithRelations,
): Candidate[] {
  const out: Candidate[] = []
  if (book.ebook?.filepath && pathBelongsTo(folder, book.ebook.filepath)) {
    out.push({
      folder,
      format: "ebook",
      filepath: book.ebook.filepath,
      existingBook: book,
    })
  }
  if (
    book.readaloud?.filepath &&
    pathBelongsTo(folder, book.readaloud.filepath)
  ) {
    out.push({
      folder,
      format: "readaloud",
      filepath: book.readaloud.filepath,
      existingBook: book,
    })
  }
  if (
    book.audiobook?.filepath &&
    pathBelongsTo(folder, book.audiobook.filepath)
  ) {
    out.push({
      folder,
      format: "audiobook",
      filepath: book.audiobook.filepath,
      existingBook: book,
    })
  }
  return out
}

export type ListCandidatesOpts = {
  folder: string
  books: BookWithRelations[]
  collections?: UUIDList
  warnIfFileAtRoot?: boolean
  importRoot?: string
  importMode?: ImportMode
  epub2ImportStrategy?: Epub2ImportStrategy
}

type UUIDList = Candidate["collections"]

/**
 * For one book folder, produce the candidates the scanner should process:
 *   - 0/1 ebook + 0/1 readaloud + 0/1 audiobook from the filesystem
 *   - PLUS candidates for any existing book whose paths live under this folder
 *     (so vanished files get marked missing by checkExistsStep).
 *
 * Enforces "at most one regular epub and one readaloud epub per folder".
 * On violation:
 *   - If no book already references this folder: warn and return only the
 *     existing-book candidates (which will be empty here, so effectively []).
 *   - If a book already exists here: warn, return only the existing-book
 *     candidates (don't ingest the offending duplicates, don't touch what's
 *     already there).
 */
export async function listBookCandidates(
  opts: ListCandidatesOpts,
  ctx: Pick<ScanCtx, "signal">,
): Promise<Candidate[]> {
  const folder = await canonicalizePath(opts.folder)
  if (ctx.signal.aborted) return []
  if (isInsideInternalDirectory(folder)) return []

  const knownBooks = booksReferencingFolder(folder, opts.books)
  const existingCandidates = knownBooks.flatMap((book) =>
    candidateFromExistingBook(folder, book),
  )

  const [epub2BackupSuffix, ignorePaths] = await Promise.all([
    getSetting("epub2BackupSuffix"),
    getIgnorePaths(),
  ])

  const classification = await classifyFolder(folder, {
    epub2BackupSuffix,
    ignorePaths,
  })
  if (!classification) return existingCandidates

  const { regularEpubs, readaloudEpubs, audiobookDir } = classification

  const violatesConstraint =
    regularEpubs.length > 1 || readaloudEpubs.length > 1
  if (violatesConstraint) {
    if (knownBooks.length === 0) {
      logger.warn({
        msg: `Folder ${folder} has multiple epubs of the same kind; skipping until cleaned up`,
        regularEpubs,
        readaloudEpubs,
      })
      return []
    }
    logger.warn({
      msg: `Folder ${folder} has multiple epubs of the same kind; ignoring duplicates, keeping existing books intact`,
      regularEpubs,
      readaloudEpubs,
    })
    return existingCandidates
  }

  if (opts.warnIfFileAtRoot && opts.importRoot) {
    const root = await canonicalizePath(opts.importRoot)
    if (resolve(folder) === resolve(root)) {
      if (regularEpubs.length || readaloudEpubs.length || audiobookDir) {
        logger.warn({
          msg: `Files found directly at the watch root ${root}; please place books in subfolders. Skipping.`,
        })
      }
      return existingCandidates
    }
  }

  const candidates: Candidate[] = [...existingCandidates]
  const seen = new Set(existingCandidates.map(candidateKey))

  // If exactly one book already lives in this folder, treat it as the
  // owner for any new format candidates we discover here
  const folderOwner = knownBooks.length === 1 ? knownBooks[0] : undefined

  function pushIfNew(candidate: Candidate) {
    if (seen.has(candidateKey(candidate))) return
    seen.add(candidateKey(candidate))
    candidates.push(candidate)
  }

  const regularEpub = regularEpubs[0]
  if (regularEpub) {
    pushIfNew({
      folder,
      format: "ebook",
      filepath: regularEpub,
      collections: opts.collections,
      ...(opts.importMode && { importMode: opts.importMode }),
      ...(opts.epub2ImportStrategy && {
        epub2ImportStrategy: opts.epub2ImportStrategy,
      }),
      ...(folderOwner && !folderOwner.ebook && { existingBook: folderOwner }),
    })
  }

  const readaloudEpub = readaloudEpubs[0]
  if (readaloudEpub) {
    pushIfNew({
      folder,
      format: "readaloud",
      filepath: readaloudEpub,
      collections: opts.collections,
      ...(opts.importMode && { importMode: opts.importMode }),
      ...(opts.epub2ImportStrategy && {
        epub2ImportStrategy: opts.epub2ImportStrategy,
      }),
      ...(folderOwner &&
        !folderOwner.readaloud && { existingBook: folderOwner }),
    })
  }

  if (audiobookDir) {
    pushIfNew({
      folder,
      format: "audiobook",
      filepath: audiobookDir,
      collections: opts.collections,
      ...(opts.importMode && { importMode: opts.importMode }),
      ...(opts.epub2ImportStrategy && {
        epub2ImportStrategy: opts.epub2ImportStrategy,
      }),
      ...(folderOwner &&
        !folderOwner.audiobook && { existingBook: folderOwner }),
    })
  }

  return candidates
}

function candidateKey(candidate: Candidate): string {
  return `${candidate.folder}::${candidate.format}::${candidate.filepath}`
}

export type WalkFoldersOpts = {
  root: string
  books: BookWithRelations[]
  warnIfFileAtRoot?: boolean
}

/**
 * Enumerate every folder under `root` that either:
 *   - contains at least one epub or audio file, or
 *   - is referenced by an existing book (so vanished files get visited).
 *
 * Returns canonicalized folder paths. Used by scanLibrary / kind:"roots".
 */
export async function walkFolders(
  opts: WalkFoldersOpts,
  ctx: Pick<ScanCtx, "signal">,
): Promise<string[]> {
  const root = await canonicalizePath(opts.root)
  if (ctx.signal.aborted) return []

  const folders = new Set<string>()

  let entries: Dirent[]
  try {
    entries = await readdir(root, { recursive: true, withFileTypes: true })
  } catch (error) {
    if (!isENOENT(error)) throw error
    entries = []
  }

  for (const entry of entries) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (ctx.signal.aborted) return []
    if (!entry.isFile() && !entry.isSymbolicLink()) continue
    if (isInsideInternalDirectory(entry.parentPath)) continue
    if (isHiddenFile(entry.name)) continue

    const ext = extname(entry.name)
    if (ext !== ".epub" && !isAudioFile(ext)) continue

    const parent = await canonicalizePath(entry.parentPath)
    folders.add(parent)
  }

  return [...folders]
}
