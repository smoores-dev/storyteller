import { type Dirent } from "node:fs"
import { mkdir, readdir } from "node:fs/promises"
import { basename, dirname, extname, join, resolve } from "node:path"

import {
  Audiobook,
  type AudiobookInputs,
} from "@storyteller-platform/audiobook"
import { Epub } from "@storyteller-platform/epub"

import { getDefaultSuffix, getInternalBookDirectory } from "@/assets/paths"
import { isAudioFile } from "@/audio"
import {
  type BookWithRelations,
  createBookFromAudiobook,
  createBookFromEpub,
  updateBook,
} from "@/database/books"
import { logger } from "@/logging"
import { type UUID } from "@/uuid"

import { cacheAudioCover, cacheTextCover } from "./coverCache"
import { type ScanFormat } from "./scanner"

export type BookPath = {
  ebook?: string
  audiobook?: string
  readaloud?: string
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

export function hasAnyRelationChange(
  book: BookWithRelations,
  bookPath: BookPath,
): boolean {
  const ebookChanged =
    !!bookPath.ebook && (!book.ebook || book.ebook.filepath !== bookPath.ebook)
  const audiobookChanged =
    !!bookPath.audiobook &&
    (!book.audiobook || book.audiobook.filepath !== bookPath.audiobook)
  const readaloudChanged =
    !!bookPath.readaloud &&
    (!book.readaloud || book.readaloud.filepath !== bookPath.readaloud)

  return ebookChanged || audiobookChanged || readaloudChanged
}

export function findMatchingBook(
  books: BookWithRelations[],
  bookPath: BookPath,
) {
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

export async function createNewBook(
  bookPath: BookPath,
  collectionUuid: UUID | null,
): Promise<BookWithRelations | null> {
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
        ...(collectionUuid && { collections: [collectionUuid] }),
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
    await cacheTextCover(created)
    await cacheAudioCover(created)
    return created
  }

  if (!bookPath.audiobook) {
    return null
  }

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
      ...(collectionUuid && { collections: [collectionUuid] }),
      audiobook: { filepath: audiobookPath },
    },
  )

  created = await ensureBookDirectory(created)
  await cacheAudioCover(created)
  return created
}

type UpdatedBookResult = {
  book: BookWithRelations
  newFormats: ScanFormat[]
}

export async function attachNewRelations(
  book: BookWithRelations,
  bookPath: BookPath,
): Promise<UpdatedBookResult> {
  const newFormats: ScanFormat[] = []
  const relations: Parameters<typeof updateBook>[2] = {}

  if (
    bookPath.ebook &&
    (!book.ebook || book.ebook.filepath !== bookPath.ebook)
  ) {
    relations.ebook = { filepath: bookPath.ebook, missing: false }
    if (!book.ebook) newFormats.push("ebook")
  }

  if (
    bookPath.audiobook &&
    (!book.audiobook || book.audiobook.filepath !== bookPath.audiobook)
  ) {
    relations.audiobook = { filepath: bookPath.audiobook, missing: false }
    if (!book.audiobook) newFormats.push("audiobook")
  }

  if (
    bookPath.readaloud &&
    (!book.readaloud || book.readaloud.filepath !== bookPath.readaloud)
  ) {
    relations.readaloud = {
      filepath: bookPath.readaloud,
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
    const key = `${path.ebook ?? ""}|${path.readaloud ?? ""}|${path.audiobook ?? ""}`
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    deduped.push(path)
  }

  return deduped
}

export async function discoverBookPaths(
  importPath: string,
  knownEbookPaths: Set<string>,
  knownReadaloudPaths: Set<string>,
  signal: AbortSignal,
): Promise<BookPath[]> {
  return discoverBookPathsForRoots(
    [{ rootPath: importPath, warnIfFileAtRoot: true }],
    knownEbookPaths,
    knownReadaloudPaths,
    signal,
  )
}

export async function discoverBookPathsForRoots(
  roots: SearchRoot[],
  knownEbookPaths: Set<string>,
  knownReadaloudPaths: Set<string>,
  signal: AbortSignal,
): Promise<BookPath[]> {
  const ebookPaths: string[] = []
  const audiobookPathsSet = new Set<string>()
  const bookPaths: BookPath[] = []

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
        ebookPaths.push(fullPath)
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

      audiobookPathsSet.add(entry.parentPath)
    }
  }

  logger.debug(
    `Discovered ${ebookPaths.length} ebook file(s) and ${audiobookPathsSet.size} audiobook folder(s) across ${roots.length} root(s)`,
  )

  const audiobookPaths = Array.from(audiobookPathsSet)
  const handledEbookPaths = new Set<string>()
  const handledAudiobookPaths = new Set<string>()

  for (const ebookPath of ebookPaths) {
    if (signal.aborted) {
      return []
    }

    if (handledEbookPaths.has(ebookPath)) {
      continue
    }

    const dir = `${dirname(ebookPath)}/`
    const additionalEbookPaths = ebookPaths.filter(
      (path) => path.startsWith(dir) && path !== ebookPath,
    )
    let plainEbookPath: string | null = null
    let readaloudPath: string | null = null

    for (const path of [ebookPath, ...additionalEbookPaths]) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (signal.aborted) {
        return []
      }

      if (plainEbookPath && readaloudPath) {
        break
      }

      if (knownEbookPaths.has(path)) {
        plainEbookPath = path
        continue
      }

      if (knownReadaloudPaths.has(path)) {
        readaloudPath = path
        continue
      }

      try {
        using epub = await Epub.from(path)
        const manifest = await epub.getManifest()
        const isReadaloud = Object.values(manifest).some(
          (item) => item.mediaOverlay,
        )

        if (isReadaloud && !readaloudPath) {
          readaloudPath = path
          handledEbookPaths.add(path)
          continue
        }

        if (!isReadaloud && !plainEbookPath) {
          plainEbookPath = path
          handledEbookPaths.add(path)
        }
      } catch (error) {
        logger.error(
          `Encountered issue attempting to read EPUB file at ${path}, skipping`,
        )
        logger.error(error)
      }
    }

    const nestedAudiobookPaths = audiobookPaths.filter((path) =>
      `${path}/`.startsWith(dir),
    )
    const [nestedAudiobookPath] = nestedAudiobookPaths
    if (nestedAudiobookPath) {
      handledAudiobookPaths.add(nestedAudiobookPath)
    }

    if (!plainEbookPath && !readaloudPath && !nestedAudiobookPath) {
      continue
    }

    bookPaths.push({
      ...(plainEbookPath && { ebook: plainEbookPath }),
      ...(readaloudPath && { readaloud: readaloudPath }),
      ...(nestedAudiobookPath && { audiobook: nestedAudiobookPath }),
    })
  }

  for (const audiobookPath of audiobookPaths) {
    if (handledAudiobookPaths.has(audiobookPath)) {
      continue
    }
    bookPaths.push({ audiobook: audiobookPath })
  }

  return dedupeBookPaths(bookPaths)
}
