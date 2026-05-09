import { type Dirent } from "node:fs"
import { mkdir, readdir, rm } from "node:fs/promises"
import { basename, dirname, extname, join, resolve } from "node:path"

import {
  Audiobook,
  type AudiobookInputs,
} from "@storyteller-platform/audiobook"
import { Epub } from "@storyteller-platform/epub"

import { copyWithHardlink, copyWithReflink, move } from "@/assets/fs"
import {
  getDefaultSuffix,
  getInternalAudioDirectory,
  getInternalBookDirectory,
  getInternalEpubFilepath,
  getInternalReadaloudFilepath,
} from "@/assets/paths"
import { isAudioFile } from "@/audio"
import {
  type BookWithRelations,
  createBook,
  createBookFromAudiobook,
  createBookFromEpub,
  updateBook,
} from "@/database/books"
import {
  addImportSkipPaths,
  getImportSkipPaths,
  removeImportSkipPaths,
} from "@/database/scans"
import { type ImportMode } from "@/database/settingsTypes"
import { logger } from "@/logging"
import { type UUID } from "@/uuid"

import { cacheAudioCover, cacheTextCover } from "./coverCache"
import { type ScanFormat } from "./scanner/types"

export type BookPath = {
  ebook?: string
  audiobook?: string
  readaloud?: string
  epubUnknown?: string[]
}

type SearchRoot = {
  rootPath: string
  warnIfFileAtRoot: boolean
}

export function getBookPathFormats(bookPath: BookPath): ScanFormat[] {
  const formats: ScanFormat[] = []

  if (bookPath.ebook) formats.push("ebook")
  if (bookPath.audiobook) formats.push("audiobook")
  if (bookPath.readaloud) formats.push("readaloud")

  return formats
}

export function findMatchingBook(
  books: BookWithRelations[],
  bookPath: BookPath,
): BookWithRelations | undefined {
  return books.find(
    (book) =>
      (bookPath.ebook && bookPath.ebook === book.ebook?.filepath) ||
      (bookPath.audiobook && bookPath.audiobook === book.audiobook?.filepath) ||
      (bookPath.readaloud && bookPath.readaloud === book.readaloud?.filepath),
  )
}

async function ensureBookDirectory(book: BookWithRelations) {
  try {
    await mkdir(getInternalBookDirectory(book))
    return book
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "EEXIST"
    ) {
      throw error
    }
  }

  return await updateBook(book.uuid, { suffix: getDefaultSuffix(book.uuid) })
}

type RelocateMode = Exclude<ImportMode, "reference">
type Relocator = (source: string, destination: string) => Promise<void>

function resolveRelocator(mode: RelocateMode): Relocator {
  if (mode === "move") {
    return move
  }

  if (mode === "hardlink") {
    return copyWithHardlink
  }

  return copyWithReflink
}

async function relocateBookPaths(
  book: BookWithRelations,
  bookPath: BookPath,
  importMode: ImportMode,
  newSkipPaths: { bookUuid: UUID; filepath: string }[],
): Promise<BookPath> {
  if (importMode === "reference") {
    for (const path of [
      bookPath.ebook,
      bookPath.readaloud,
      bookPath.audiobook,
    ]) {
      if (path) newSkipPaths.push({ bookUuid: book.uuid, filepath: path })
    }
    return bookPath
  }

  const relocate = resolveRelocator(importMode)
  const relocated: BookPath = {}

  if (bookPath.ebook) {
    const destPath = getInternalEpubFilepath(book)
    await mkdir(dirname(destPath), { recursive: true })
    await relocate(bookPath.ebook, destPath)
    relocated.ebook = destPath

    if (importMode !== "move")
      newSkipPaths.push({ bookUuid: book.uuid, filepath: bookPath.ebook })
  }

  if (bookPath.readaloud) {
    const destPath = getInternalReadaloudFilepath(book)
    await mkdir(dirname(destPath), { recursive: true })
    await relocate(bookPath.readaloud, destPath)
    relocated.readaloud = destPath

    if (importMode !== "move")
      newSkipPaths.push({ bookUuid: book.uuid, filepath: bookPath.readaloud })
  }

  if (bookPath.audiobook) {
    const sourceDir = bookPath.audiobook
    const destDir = getInternalAudioDirectory(book)
    await mkdir(destDir, { recursive: true })

    const entries = await readdir(sourceDir)
    for (const entry of entries) {
      if (!isAudioFile(entry)) continue
      await relocate(join(sourceDir, entry), join(destDir, entry))
    }

    if (importMode === "move") {
      await rm(sourceDir, { recursive: true })
    }

    relocated.audiobook = destDir

    if (importMode !== "move")
      newSkipPaths.push({ bookUuid: book.uuid, filepath: bookPath.audiobook })
  }

  if (bookPath.epubUnknown?.length) {
    relocated.epubUnknown = [...bookPath.epubUnknown]
  }

  return relocated
}

export async function createNewBook(
  bookPath: BookPath,
  collectionUuid: UUID | null,
  importMode: ImportMode,
  newSkipPaths: { bookUuid: UUID; filepath: string }[],
): Promise<BookWithRelations | null> {
  const collectionRelation = collectionUuid
    ? { collections: [collectionUuid] }
    : {}

  // if we already know which epub is which (from a previous scan), use the
  // classified path and open it for metadata.
  if (bookPath.readaloud || bookPath.ebook) {
    const sourceEpub = bookPath.readaloud ?? bookPath.ebook
    if (!sourceEpub) {
      return null
    }

    using epub = await Epub.from(sourceEpub)
    let created = await createBookFromEpub(
      epub,
      { title: basename(sourceEpub, ".epub") },
      {
        ...collectionRelation,
        ...(bookPath.ebook && { ebook: { filepath: bookPath.ebook } }),
        ...(bookPath.readaloud && {
          readaloud: {
            filepath: bookPath.readaloud,
            status: "ALIGNED",
            currentStage: "SPLIT_TRACKS",
          },
        }),
        ...(bookPath.audiobook && {
          audiobook: { filepath: bookPath.audiobook },
        }),
      },
    )

    created = await ensureBookDirectory(created)
    const relocated = await relocateBookPaths(
      created,
      bookPath,
      importMode,
      newSkipPaths,
    )

    created = await updateBook(created.uuid, null, {
      ...(relocated.ebook && {
        ebook: { filepath: relocated.ebook, missing: false },
      }),
      ...(relocated.readaloud && {
        readaloud: {
          filepath: relocated.readaloud,
          missing: false,
          status: created.readaloud?.status ?? "ALIGNED",
          currentStage: created.readaloud?.currentStage ?? "SPLIT_TRACKS",
        },
      }),
      ...(relocated.audiobook && {
        audiobook: { filepath: relocated.audiobook, missing: false },
      }),
    })

    await cacheTextCover(created)
    await cacheAudioCover(created)
    return created
  }

  // if there's an audiobook, use it for metadata extraction
  if (bookPath.audiobook) {
    const audiobookPath = bookPath.audiobook
    const entries = await readdir(audiobookPath)
    const tracks = entries
      .filter((entry) => isAudioFile(entry))
      .map((relativePath) => join(audiobookPath, relativePath))

    using audiobook = await Audiobook.from(...(tracks as AudiobookInputs))
    let created = await createBookFromAudiobook(
      audiobook,
      { title: basename(audiobookPath) },
      {
        ...collectionRelation,
        audiobook: { filepath: audiobookPath },
      },
    )

    created = await ensureBookDirectory(created)
    const relocated = await relocateBookPaths(
      created,
      bookPath,
      importMode,
      newSkipPaths,
    )
    if (relocated.audiobook) {
      created = await updateBook(created.uuid, null, {
        audiobook: { filepath: relocated.audiobook, missing: false },
      })
    }

    await cacheAudioCover(created)
    return created
  }

  // unclassified epubs only -- create a minimal book record.
  // the scanner pipeline will open the epub, determine its format
  // (ebook vs readaloud), extract metadata, and create the relation.
  const firstEpub = bookPath.epubUnknown?.[0]
  if (!firstEpub) {
    return null
  }

  let created = await createBook(
    { title: basename(firstEpub, ".epub") },
    collectionRelation,
  )

  created = await ensureBookDirectory(created)
  return created
}

type UpdatedBookResult = {
  book: BookWithRelations
  newFormats: ScanFormat[]
}

export async function attachNewRelations(
  book: BookWithRelations,
  bookPath: BookPath,
  importMode: ImportMode,
  newSkipPaths: { bookUuid: UUID; filepath: string }[],
): Promise<UpdatedBookResult> {
  const pathToAttach = await relocateBookPaths(
    book,
    bookPath,
    importMode,
    newSkipPaths,
  )
  const newFormats: ScanFormat[] = []
  const relations: Parameters<typeof updateBook>[2] = {}

  if (
    pathToAttach.ebook &&
    (!book.ebook || book.ebook.filepath !== pathToAttach.ebook)
  ) {
    relations.ebook = { filepath: pathToAttach.ebook, missing: false }
    if (!book.ebook) newFormats.push("ebook")
  }

  if (
    pathToAttach.audiobook &&
    (!book.audiobook || book.audiobook.filepath !== pathToAttach.audiobook)
  ) {
    relations.audiobook = { filepath: pathToAttach.audiobook, missing: false }
    if (!book.audiobook) newFormats.push("audiobook")
  }

  if (
    pathToAttach.readaloud &&
    (!book.readaloud || book.readaloud.filepath !== pathToAttach.readaloud)
  ) {
    relations.readaloud = {
      filepath: pathToAttach.readaloud,
      missing: false,
      status: book.readaloud?.status ?? "ALIGNED",
      currentStage: book.readaloud?.currentStage ?? "SPLIT_TRACKS",
    }
    if (!book.readaloud) newFormats.push("readaloud")
  }

  if (!Object.keys(relations).length) {
    return { book, newFormats }
  }

  const updated = await updateBook(book.uuid, null, relations)
  await cacheTextCover(updated)
  await cacheAudioCover(updated)
  return { book: updated, newFormats }
}

function isENOENT(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

function dedupeBookPaths(paths: BookPath[]): BookPath[] {
  const seen = new Set<string>()
  const deduped: BookPath[] = []

  for (const path of paths) {
    const key = [
      path.ebook ?? "",
      path.readaloud ?? "",
      path.audiobook ?? "",
      ...(path.epubUnknown ?? []),
    ].join("|")

    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    deduped.push(path)
  }

  return deduped
}

export async function discoverBookPathsForRoots(
  roots: SearchRoot[],
  knownEbookPaths: Set<string>,
  knownReadaloudPaths: Set<string>,
  signal: AbortSignal,
): Promise<BookPath[]> {
  const epubPaths: string[] = []
  const audiobookPathsSet = new Set<string>()
  const bookPaths: BookPath[] = []

  const skipPaths = new Set(
    (await getImportSkipPaths()).map((row) => row.filepath),
  )
  const seenSkipPaths = new Set<string>()
  const newSkipPaths: { bookUuid: UUID; filepath: string }[] = []

  for (const root of roots) {
    if (signal.aborted) {
      return []
    }

    let entries: Dirent[]
    try {
      entries = await readdir(root.rootPath, {
        recursive: true,
        withFileTypes: true,
      })
    } catch (error) {
      if (isENOENT(error)) {
        continue
      }
      throw error
    }

    for (const entry of entries) {
      if (!entry.isFile() && !entry.isSymbolicLink()) {
        continue
      }

      const ext = extname(entry.name)
      const fullPath = join(entry.parentPath, entry.name)
      const isRootFile = resolve(entry.parentPath) === resolve(root.rootPath)

      if (ext === ".epub") {
        if (root.warnIfFileAtRoot && isRootFile) {
          logger.warn(
            `Found an EPUB file that was not in a book folder: skipping. Please place all files within book-specific folders: https://storyteller-platform.gitlab.io/storyteller/docs/managing/adding#organizing-your-auto-import-folder. ${fullPath}`,
          )
          continue
        }

        if (skipPaths.has(fullPath)) {
          seenSkipPaths.add(fullPath)
          continue
        }
        epubPaths.push(fullPath)
        continue
      }

      if (!isAudioFile(ext)) {
        continue
      }

      if (root.warnIfFileAtRoot && isRootFile) {
        logger.warn(
          `Found an audiobook file that was not in a book folder: skipping. Please place all files within book-specific folders: https://storyteller-platform.gitlab.io/storyteller/docs/managing/adding#organizing-your-auto-import-folder. ${fullPath}`,
        )
        continue
      }

      if (skipPaths.has(entry.parentPath)) {
        seenSkipPaths.add(entry.parentPath)
        continue
      }

      audiobookPathsSet.add(entry.parentPath)
    }
  }

  logger.debug(
    `Discovered ${epubPaths.length} epub file(s) and ${audiobookPathsSet.size} audiobook folder(s) across ${roots.length} root(s)`,
  )

  const audiobookPaths = Array.from(audiobookPathsSet)
  const handledEpubPaths = new Set<string>()
  const handledAudiobookPaths = new Set<string>()

  for (const epubPath of epubPaths) {
    if (signal.aborted) {
      return []
    }

    if (handledEpubPaths.has(epubPath)) {
      continue
    }

    // gather all epubs in the same directory
    const dir = `${dirname(epubPath)}/`
    const siblingEpubPaths = epubPaths.filter(
      (path) => path.startsWith(dir) && path !== epubPath,
    )

    const allEpubsInDir = [epubPath, ...siblingEpubPaths]

    // classify: known paths go into their known format,
    // everything else is unclassified and will be resolved by the scanner
    let plainEbookPath: string | null = null
    let readaloudPath: string | null = null
    const unknownEpubs: string[] = []

    for (const path of allEpubsInDir) {
      if (knownEbookPaths.has(path)) {
        plainEbookPath = path
      } else if (knownReadaloudPaths.has(path)) {
        readaloudPath = path
      } else {
        unknownEpubs.push(path)
      }

      handledEpubPaths.add(path)
    }

    // pair with the closest audiobook directory
    const nestedAudiobookPaths = audiobookPaths.filter((path) =>
      `${path}/`.startsWith(dir),
    )
    const [nestedAudiobookPath] = nestedAudiobookPaths
    if (nestedAudiobookPath) {
      handledAudiobookPaths.add(nestedAudiobookPath)
    }

    const hasAnything =
      plainEbookPath ||
      readaloudPath ||
      nestedAudiobookPath ||
      unknownEpubs.length > 0

    if (!hasAnything) {
      continue
    }

    bookPaths.push({
      ...(plainEbookPath && { ebook: plainEbookPath }),
      ...(readaloudPath && { readaloud: readaloudPath }),
      ...(nestedAudiobookPath && { audiobook: nestedAudiobookPath }),
      ...(unknownEpubs.length > 0 && { epubUnknown: unknownEpubs }),
    })
  }

  for (const audiobookPath of audiobookPaths) {
    if (handledAudiobookPaths.has(audiobookPath)) {
      continue
    }

    bookPaths.push({ audiobook: audiobookPath })
  }

  // Persist skip paths: add new ones, remove stale ones (files no longer in import directory)
  if (newSkipPaths.length > 0) {
    await addImportSkipPaths(newSkipPaths)
  }
  const staleSkipPaths = [...skipPaths].filter((p) => !seenSkipPaths.has(p))
  if (staleSkipPaths.length > 0) {
    await removeImportSkipPaths(staleSkipPaths)
  }

  return dedupeBookPaths(bookPaths)
}
