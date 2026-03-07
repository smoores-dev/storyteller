import { mkdir, readdir, stat } from "node:fs/promises"
import { basename, dirname, extname, join, resolve } from "node:path"

import {
  Audiobook,
  type AudiobookInputs,
} from "@storyteller-platform/audiobook"
import { Epub } from "@storyteller-platform/epub"

import {
  getAudioCover,
  getEpubCover,
  writeExtractedAudiobookCover,
  writeExtractedEbookCover,
} from "@/assets/covers"
import { writeCachedCoverImage } from "@/assets/fs"
import { getDefaultSuffix, getInternalBookDirectory } from "@/assets/paths"
import { isAudioFile } from "@/audio"
import {
  type BookWithRelations,
  createBookFromAudiobook,
  createBookFromEpub,
  getBookByAudiobookFilepathPrefix,
  getBooks,
  updateBook,
} from "@/database/books"
import { optimizeImage } from "@/images"
import { logger } from "@/logging"
import { type UUID } from "@/uuid"

import {
  createScanContext,
  runBookScanPipeline,
  type ScanFlag,
  type ScanFormat,
} from "./scanner"

type BookPath = {
  ebook?: string
  audiobook?: string
  readaloud?: string
}

type UpdatedBookResult = {
  book: BookWithRelations
  newFormats: ScanFormat[]
}

function getScopedBooks(
  allBooks: BookWithRelations[],
  collectionUuid: UUID | null,
): BookWithRelations[] {
  if (!collectionUuid) {
    return allBooks
  }

  return allBooks.filter((book) =>
    book.collections.some((collection) => collection.uuid === collectionUuid),
  )
}

function getBookPathFormats(bookPath: BookPath): ScanFormat[] {
  const formats: ScanFormat[] = []
  if (bookPath.ebook) {
    formats.push("ebook")
  }
  if (bookPath.audiobook) {
    formats.push("audiobook")
  }
  return formats
}

function registerNewFlags(
  flagsByBook: Map<UUID, Set<ScanFormat>>,
  bookUuid: UUID,
  formats: ScanFormat[],
) {
  if (formats.length === 0) {
    return
  }

  const existing = flagsByBook.get(bookUuid) ?? new Set<ScanFormat>()
  for (const format of formats) {
    existing.add(format)
  }
  flagsByBook.set(bookUuid, existing)
}

function hasAnyRelationChange(book: BookWithRelations, bookPath: BookPath): boolean {
  if (bookPath.ebook && !book.ebook) {
    return true
  }
  if (bookPath.audiobook && !book.audiobook) {
    return true
  }
  if (bookPath.readaloud && !book.readaloud) {
    return true
  }
  return false
}

function findMatchingBook(books: BookWithRelations[], bookPath: BookPath) {
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
    if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") {
      throw error
    }
  }

  return await updateBook(book.uuid, { suffix: getDefaultSuffix(book.uuid) })
}

async function cacheTextCover(book: BookWithRelations) {
  const coverImage = await getEpubCover(book)
  if (!coverImage) {
    return
  }

  await writeExtractedEbookCover(book, coverImage.filename, coverImage.data)
  const optimized = await optimizeImage({
    buffer: coverImage.data,
    height: 225,
    width: 147,
    contentType: coverImage.mimeType,
  })

  await writeCachedCoverImage(book.uuid, "text", 225, 147, {
    ...coverImage,
    data: optimized,
  })
}

async function cacheAudioCover(book: BookWithRelations) {
  const audioCover = await getAudioCover(book)
  if (!audioCover) {
    return
  }

  await writeExtractedAudiobookCover(book, audioCover.filename, audioCover.data)
  const optimized = await optimizeImage({
    buffer: Buffer.from(audioCover.data),
    height: 147,
    width: 147,
    contentType: audioCover.mimeType,
  })

  await writeCachedCoverImage(book.uuid, "audio", 147, 147, {
    ...audioCover,
    data: optimized,
  })
}

async function createNewBook(
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
        ...(bookPath.audiobook && { audiobook: { filepath: bookPath.audiobook } }),
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

async function attachNewRelations(
  book: BookWithRelations,
  bookPath: BookPath,
): Promise<UpdatedBookResult> {
  const newFormats: ScanFormat[] = []
  const relations: Parameters<typeof updateBook>[2] = {}

  if (bookPath.ebook && !book.ebook) {
    relations.ebook = {
      filepath: bookPath.ebook,
      missing: false,
    }
    newFormats.push("ebook")
  }

  if (bookPath.audiobook && !book.audiobook) {
    relations.audiobook = {
      filepath: bookPath.audiobook,
      missing: false,
    }
    newFormats.push("audiobook")
  }

  if (bookPath.readaloud && !book.readaloud) {
    relations.readaloud = {
      filepath: bookPath.readaloud,
      missing: false,
      status: "ALIGNED",
      currentStage: "SPLIT_TRACKS",
    }
  }

  if (!Object.keys(relations).length) {
    return { book, newFormats }
  }

  const updated = await updateBook(book.uuid, null, relations)
  await cacheTextCover(updated)
  await cacheAudioCover(updated)
  return { book: updated, newFormats }
}

async function updateReadaloudMissingState(
  books: BookWithRelations[],
  signal: AbortSignal,
) {
  for (const book of books) {
    if (signal.aborted) {
      return
    }

    if (!book.readaloud?.filepath) {
      continue
    }

    try {
      await stat(book.readaloud.filepath)
      if (!book.readaloud.missing) {
        continue
      }

      await updateBook(book.uuid, null, {
        readaloud: {
          filepath: book.readaloud.filepath,
          missing: false,
          currentStage: book.readaloud.currentStage,
        },
      })
      continue
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
        throw error
      }
    }

    if (book.readaloud.missing) {
      continue
    }

    await updateBook(book.uuid, null, {
      readaloud: {
        filepath: book.readaloud.filepath,
        missing: true,
        currentStage: book.readaloud.currentStage,
      },
    })
  }
}

async function discoverBookPaths(
  importPath: string,
  knownEbookPaths: Set<string>,
  knownReadaloudPaths: Set<string>,
  signal: AbortSignal,
) {
  logger.debug("Starting recursive directory scan...")
  const entries = await readdir(importPath, {
    recursive: true,
    withFileTypes: true,
  })
  logger.debug(`Found ${entries.length} files recursively`)

  if (signal.aborted) {
    logger.debug("Scanning aborted")
    return [] as BookPath[]
  }

  const ebookPaths: string[] = []
  const audiobookPathsSet = new Set<string>()
  const bookPaths: BookPath[] = []

  logger.debug("Searching for new epub and audio files...")
  for (const entry of entries) {
    if (!entry.isFile() && !entry.isSymbolicLink()) {
      continue
    }

    const ext = extname(entry.name)
    if (ext === ".epub") {
      if (resolve(entry.parentPath) === resolve(importPath)) {
        logger.warn(
          `Found an EPUB file that was not in a book folder: skipping. Please place all files within book-specific folders: https://storyteller-platform.gitlab.io/storyteller/docs/managing/adding#organizing-your-auto-import-folder. ${entry.parentPath}${entry.name}`,
        )
        continue
      }
      ebookPaths.push(join(entry.parentPath, entry.name))
    }

    if (!isAudioFile(ext)) {
      continue
    }

    if (resolve(entry.parentPath) === resolve(importPath)) {
      logger.warn(
        `Found an audiobook file that was not in a book folder: skipping. Please place all files within book-specific folders: https://storyteller-platform.gitlab.io/storyteller/docs/managing/adding#organizing-your-auto-import-folder. ${entry.parentPath}${entry.name}`,
      )
      continue
    }

    audiobookPathsSet.add(entry.parentPath)
  }

  logger.debug(
    `Found ${ebookPaths.length} ebook files and ${audiobookPathsSet.size} audiobook folders`,
  )

  const audiobookPaths = Array.from(audiobookPathsSet)
  const handledEbookPaths = new Set<string>()
  const handledAudiobookPaths = new Set<string>()

  logger.debug("Checking ebooks for adjacent readalouds and audio...")
  for (const ebookPath of ebookPaths) {
    if (signal.aborted) {
      logger.debug("Scanning aborted")
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
      if (signal.aborted) {
        logger.debug("Scanning aborted")
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

  logger.debug("Checking for standalone audiobooks...")
  for (const audiobookPath of audiobookPaths) {
    if (handledAudiobookPaths.has(audiobookPath)) {
      continue
    }
    bookPaths.push({ audiobook: audiobookPath })
  }

  return bookPaths
}

export async function scan(
  importPath: string,
  collectionUuid: UUID | null,
  signal: AbortSignal,
) {
  logger.debug(`Starting new scan for ${importPath}`)
  const allBooks = await getBooks()
  if (signal.aborted) {
    logger.debug("Scanning aborted")
    return
  }

  let books = getScopedBooks(allBooks, collectionUuid)
  const knownEbookPaths = new Set(
    books.map((book) => book.ebook?.filepath).filter((path): path is string => !!path),
  )
  const knownReadaloudPaths = new Set(
    books
      .map((book) => book.readaloud?.filepath)
      .filter((path): path is string => !!path),
  )

  const bookPaths = await discoverBookPaths(
    importPath,
    knownEbookPaths,
    knownReadaloudPaths,
    signal,
  )
  if (signal.aborted) {
    logger.debug("Scanning aborted")
    return
  }

  logger.debug(`Found ${bookPaths.length} book folders.`)
  const newFlagsByBook = new Map<UUID, Set<ScanFormat>>()

  logger.debug("Searching found book folders for new books...")
  for (const bookPath of bookPaths) {
    if (signal.aborted) {
      logger.debug("Scanning aborted")
      return
    }

    const book = findMatchingBook(books, bookPath)
    if (!book) {
      logger.debug(`Found a new book! Importing from ${JSON.stringify(bookPath)}`)

      if (bookPath.audiobook) {
        const nestedBook = await getBookByAudiobookFilepathPrefix(bookPath.audiobook)
        if (nestedBook) {
          logger.warn(
            `Found a new audiobook file in the folder ${bookPath.audiobook}, but the book ${nestedBook.title} already has audiobook files at ${nestedBook.audiobookFilepath}: skipping. Please place all files within book-specific folders: https://storyteller-platform.gitlab.io/storyteller/docs/managing/adding#organizing-your-auto-import-folder.`,
          )
          continue
        }
      }

      try {
        const created = await createNewBook(bookPath, collectionUuid)
        if (!created) {
          continue
        }

        books.push(created)
        registerNewFlags(newFlagsByBook, created.uuid, getBookPathFormats(bookPath))
      } catch (error) {
        logger.error(
          `Encountered issue attempting to import from ${JSON.stringify(bookPath)}, skipping`,
        )
        logger.error(error)
      }
      continue
    }

    if (!hasAnyRelationChange(book, bookPath)) {
      continue
    }

    const updated = await attachNewRelations(book, bookPath)
    registerNewFlags(newFlagsByBook, book.uuid, updated.newFormats)
    books = books.map((candidate) =>
      candidate.uuid === updated.book.uuid ? updated.book : candidate,
    )
  }

  const refreshedBooks = getScopedBooks(await getBooks(), collectionUuid)
  const contexts = refreshedBooks.flatMap((book) => {
    const formats = newFlagsByBook.get(book.uuid) ?? new Set<ScanFormat>()
    const makeFlags = (format: ScanFormat): ScanFlag[] =>
      formats.has(format) ? ["new"] : []

    const entries = []
    if (book.ebook?.filepath) {
      entries.push(
        createScanContext({
          bookUuid: book.uuid,
          format: "ebook",
          filepath: book.ebook.filepath,
          missing: book.ebook.missing,
          existingHash: book.ebook.contentHash ?? null,
          flags: makeFlags("ebook"),
          book,
        }),
      )
    }

    if (book.audiobook?.filepath) {
      entries.push(
        createScanContext({
          bookUuid: book.uuid,
          format: "audiobook",
          filepath: book.audiobook.filepath,
          missing: book.audiobook.missing,
          existingHash: book.audiobook.contentHash ?? null,
          flags: makeFlags("audiobook"),
          book,
        }),
      )
    }
    return entries
  })

  await runBookScanPipeline(contexts, signal)
  await updateReadaloudMissingState(refreshedBooks, signal)

  logger.info("Scanning complete")
}
