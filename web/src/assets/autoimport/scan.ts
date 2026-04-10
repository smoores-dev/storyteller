import { type Dirent } from "node:fs"
import { mkdir, readdir, stat } from "node:fs/promises"
import { basename, dirname, extname, join, relative, resolve } from "node:path"

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
  getBookByAudiobookFilepathPrefix,
  getBooks,
  updateBook,
} from "@/database/books"
import { logger } from "@/logging"
import { type UUID } from "@/uuid"

import { cacheAudioCover, cacheTextCover } from "./coverCache"
import {
  type ScanFlag,
  type ScanFormat,
  createScanContext,
  runBookScanPipeline,
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

export type ImportPathChange = {
  path: string
  type: "create" | "update" | "delete"
}

type SearchRoot = {
  rootPath: string
  warnIfFileAtRoot: boolean
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
  if (bookPath.readaloud) {
    formats.push("readaloud")
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

function hasAnyRelationChange(
  book: BookWithRelations,
  bookPath: BookPath,
): boolean {
  if (
    bookPath.ebook &&
    (!book.ebook || book.ebook.filepath !== bookPath.ebook)
  ) {
    return true
  }
  if (
    bookPath.audiobook &&
    (!book.audiobook || book.audiobook.filepath !== bookPath.audiobook)
  ) {
    return true
  }
  if (
    bookPath.readaloud &&
    (!book.readaloud || book.readaloud.filepath !== bookPath.readaloud)
  ) {
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

async function attachNewRelations(
  book: BookWithRelations,
  bookPath: BookPath,
): Promise<UpdatedBookResult> {
  const newFormats: ScanFormat[] = []
  const relations: Parameters<typeof updateBook>[2] = {}

  if (
    bookPath.ebook &&
    (!book.ebook || book.ebook.filepath !== bookPath.ebook)
  ) {
    relations.ebook = {
      filepath: bookPath.ebook,
      missing: false,
    }
    if (!book.ebook) {
      newFormats.push("ebook")
    }
  }

  if (
    bookPath.audiobook &&
    (!book.audiobook || book.audiobook.filepath !== bookPath.audiobook)
  ) {
    relations.audiobook = {
      filepath: bookPath.audiobook,
      missing: false,
    }
    if (!book.audiobook) {
      newFormats.push("audiobook")
    }
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
    if (!book.readaloud) {
      newFormats.push("readaloud")
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
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "ENOENT"
      ) {
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

function isENOENT(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }
  if (!("code" in error)) {
    return false
  }
  return error.code === "ENOENT"
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

async function discoverBookPathsForRoots(
  roots: SearchRoot[],
  knownEbookPaths: Set<string>,
  knownReadaloudPaths: Set<string>,
  signal: AbortSignal,
): Promise<BookPath[]> {
  const ebookPaths: string[] = []
  const audiobookPathsSet = new Set<string>()
  const bookPaths: BookPath[] = []

  logger.debug(
    `Starting recursive directory scan for ${roots.length} root(s)...`,
  )
  for (const root of roots) {
    if (signal.aborted) {
      logger.debug("Scanning aborted")
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

    logger.debug(
      `Found ${entries.length} files recursively in ${root.rootPath}`,
    )
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
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
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

  return dedupeBookPaths(bookPaths)
}

async function discoverBookPaths(
  importPath: string,
  knownEbookPaths: Set<string>,
  knownReadaloudPaths: Set<string>,
  signal: AbortSignal,
) {
  return await discoverBookPathsForRoots(
    [{ rootPath: importPath, warnIfFileAtRoot: true }],
    knownEbookPaths,
    knownReadaloudPaths,
    signal,
  )
}

function normalizePath(path: string): string {
  return resolve(path)
}

function isWithinPath(rootPath: string, candidatePath: string): boolean {
  const rel = relative(normalizePath(rootPath), normalizePath(candidatePath))
  if (!rel || rel === ".") {
    return true
  }
  return !rel.startsWith("..")
}

function pathsOverlap(left: string, right: string): boolean {
  const normalizedLeft = normalizePath(left)
  const normalizedRight = normalizePath(right)
  if (normalizedLeft === normalizedRight) {
    return true
  }
  if (normalizedLeft.startsWith(`${normalizedRight}/`)) {
    return true
  }
  if (normalizedLeft.startsWith(`${normalizedRight}\\`)) {
    return true
  }
  if (normalizedRight.startsWith(`${normalizedLeft}/`)) {
    return true
  }
  if (normalizedRight.startsWith(`${normalizedLeft}\\`)) {
    return true
  }
  return false
}

function registerFormats(
  formatsByBook: Map<UUID, Set<ScanFormat>>,
  bookUuid: UUID,
  formats: ScanFormat[],
) {
  if (!formats.length) {
    return
  }
  const existing = formatsByBook.get(bookUuid) ?? new Set<ScanFormat>()
  for (const format of formats) {
    existing.add(format)
  }
  formatsByBook.set(bookUuid, existing)
}

function getAffectedFormatsFromChanges(
  books: BookWithRelations[],
  changes: ImportPathChange[],
): Map<UUID, Set<ScanFormat>> {
  const affected = new Map<UUID, Set<ScanFormat>>()
  for (const change of changes) {
    for (const book of books) {
      const formats: ScanFormat[] = []
      if (
        book.ebook?.filepath &&
        pathsOverlap(book.ebook.filepath, change.path)
      ) {
        formats.push("ebook")
      }
      if (
        book.audiobook?.filepath &&
        pathsOverlap(book.audiobook.filepath, change.path)
      ) {
        formats.push("audiobook")
      }
      if (
        book.readaloud?.filepath &&
        pathsOverlap(book.readaloud.filepath, change.path)
      ) {
        formats.push("readaloud")
      }
      registerFormats(affected, book.uuid, formats)
    }
  }
  return affected
}

function getDiscoveryRootsFromChanges(
  importPath: string,
  changes: ImportPathChange[],
): string[] {
  const roots = new Set<string>()
  const normalizedImportPath = normalizePath(importPath)
  for (const change of changes) {
    if (change.type === "delete") {
      continue
    }

    const candidateRoot = extname(change.path)
      ? dirname(change.path)
      : change.path
    const normalizedCandidateRoot = normalizePath(candidateRoot)
    if (!isWithinPath(normalizedImportPath, normalizedCandidateRoot)) {
      continue
    }
    if (normalizedCandidateRoot === normalizedImportPath) {
      continue
    }
    roots.add(normalizedCandidateRoot)
  }
  return Array.from(roots)
}

function mergeChangeType(
  previous: ImportPathChange["type"] | undefined,
  next: ImportPathChange["type"],
): ImportPathChange["type"] | null {
  if (!previous) {
    return next
  }
  if (previous === "create") {
    if (next === "delete") {
      return null
    }
    return "create"
  }
  if (previous === "update") {
    if (next === "delete") {
      return "delete"
    }
    return "update"
  }
  if (next === "create") {
    return "update"
  }
  return "delete"
}

function coalesceChanges(changes: ImportPathChange[]): ImportPathChange[] {
  const byPath = new Map<string, ImportPathChange["type"]>()
  for (const change of changes) {
    const path = normalizePath(change.path)
    const merged = mergeChangeType(byPath.get(path), change.type)
    if (!merged) {
      byPath.delete(path)
      continue
    }
    byPath.set(path, merged)
  }
  return Array.from(byPath.entries()).map(([path, type]) => ({ path, type }))
}

export async function scan(
  importPath: string,
  collectionUuid: UUID | null,
  signal: AbortSignal,
): Promise<Set<UUID>> {
  const scannedBookUuids = new Set<UUID>()

  logger.debug(`Starting new scan for ${importPath}`)
  const allBooks = await getBooks()
  if (signal.aborted) {
    logger.debug("Scanning aborted")
    return scannedBookUuids
  }

  let books = getScopedBooks(allBooks, collectionUuid)
  const knownEbookPaths = new Set(
    books
      .map((book) => book.ebook?.filepath)
      .filter((path): path is string => !!path),
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
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (signal.aborted) {
    logger.debug("Scanning aborted")
    return scannedBookUuids
  }

  logger.debug(`Found ${bookPaths.length} book folders.`)
  const newFlagsByBook = new Map<UUID, Set<ScanFormat>>()

  logger.debug("Searching found book folders for new books...")
  for (const bookPath of bookPaths) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (signal.aborted) {
      logger.debug("Scanning aborted")
      return scannedBookUuids
    }

    // check all books (not just scoped) to prevent duplicates across overlapping import paths
    const globalMatch = findMatchingBook(allBooks, bookPath)
    const book =
      globalMatch && books.some((b) => b.uuid === globalMatch.uuid)
        ? globalMatch
        : null

    if (globalMatch && !book) {
      logger.warn(
        `File at ${JSON.stringify(bookPath)} already belongs to book "${globalMatch.title}" in another collection, skipping`,
      )
      continue
    }

    if (!book) {
      logger.debug(
        `Found a new book! Importing from ${JSON.stringify(bookPath)}`,
      )

      if (bookPath.audiobook) {
        const nestedBook = await getBookByAudiobookFilepathPrefix(
          bookPath.audiobook,
        )
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
        registerNewFlags(
          newFlagsByBook,
          created.uuid,
          getBookPathFormats(bookPath),
        )
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

  await runBookScanPipeline(contexts, {
    concurrency: 2,
    onProgress: (processed, total) => {
      logger.debug(`Scanning ${importPath}: (${processed}/${total})`)
    },
    signal,
  })
  await updateReadaloudMissingState(refreshedBooks, signal)

  for (const ctx of contexts) {
    scannedBookUuids.add(ctx.bookUuid)
  }

  logger.info("Scanning complete")
  return scannedBookUuids
}

export async function scanChangedPaths(
  importPath: string,
  collectionUuid: UUID | null,
  changes: ImportPathChange[],
  signal: AbortSignal,
) {
  const normalizedImportPath = normalizePath(importPath)
  const normalizedChanges = coalesceChanges(changes).filter((change) =>
    isWithinPath(normalizedImportPath, change.path),
  )
  if (!normalizedChanges.length) {
    logger.debug(`No relevant changes detected for ${importPath}`)
    return
  }

  logger.debug(
    `Starting incremental scan for ${importPath} with ${normalizedChanges.length} change(s)`,
  )

  let allBooks = await getBooks()
  if (signal.aborted) {
    logger.debug("Incremental scan aborted")
    return
  }
  let scopedBooks = getScopedBooks(allBooks, collectionUuid)

  const affectedFormatsByBook = getAffectedFormatsFromChanges(
    scopedBooks,
    normalizedChanges,
  )
  const newFormatsByBook = new Map<UUID, Set<ScanFormat>>()

  const knownEbookPaths = new Set(
    scopedBooks
      .map((book) => book.ebook?.filepath)
      .filter((path): path is string => !!path),
  )
  const knownReadaloudPaths = new Set(
    scopedBooks
      .map((book) => book.readaloud?.filepath)
      .filter((path): path is string => !!path),
  )

  const discoveryRoots = getDiscoveryRootsFromChanges(
    normalizedImportPath,
    normalizedChanges,
  )
  if (discoveryRoots.length) {
    const discoveredBookPaths = await discoverBookPathsForRoots(
      discoveryRoots.map((rootPath) => ({
        rootPath,
        warnIfFileAtRoot: false,
      })),
      knownEbookPaths,
      knownReadaloudPaths,
      signal,
    )

    for (const bookPath of discoveredBookPaths) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (signal.aborted) {
        logger.debug("Incremental scan aborted")
        return
      }

      const globalMatch = findMatchingBook(allBooks, bookPath)
      const scopedMatch =
        globalMatch &&
        scopedBooks.some((book) => book.uuid === globalMatch.uuid)
          ? globalMatch
          : null

      if (globalMatch && !scopedMatch) {
        logger.warn(
          `File at ${JSON.stringify(bookPath)} already belongs to book "${globalMatch.title}" in another collection, skipping`,
        )
        continue
      }

      if (!scopedMatch) {
        if (bookPath.audiobook) {
          const nestedBook = await getBookByAudiobookFilepathPrefix(
            bookPath.audiobook,
          )
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

          const discoveredFormats = getBookPathFormats(bookPath)
          registerFormats(
            affectedFormatsByBook,
            created.uuid,
            discoveredFormats,
          )
          registerFormats(newFormatsByBook, created.uuid, discoveredFormats)
          scopedBooks.push(created)
          allBooks.push(created)
          continue
        } catch (error) {
          logger.error(
            `Encountered issue attempting to import from ${JSON.stringify(bookPath)}, skipping`,
          )
          logger.error(error)
          continue
        }
      }

      if (!hasAnyRelationChange(scopedMatch, bookPath)) {
        continue
      }

      const updated = await attachNewRelations(scopedMatch, bookPath)
      registerFormats(
        affectedFormatsByBook,
        updated.book.uuid,
        updated.newFormats,
      )
      registerFormats(newFormatsByBook, updated.book.uuid, updated.newFormats)
      scopedBooks = scopedBooks.map((book) =>
        book.uuid === updated.book.uuid ? updated.book : book,
      )
      allBooks = allBooks.map((book) =>
        book.uuid === updated.book.uuid ? updated.book : book,
      )
    }
  }

  if (!affectedFormatsByBook.size) {
    logger.debug(`No affected books found for ${importPath}`)
    return
  }

  const refreshedBooks = getScopedBooks(await getBooks(), collectionUuid)
  const contexts = refreshedBooks.flatMap((book) => {
    const formats = affectedFormatsByBook.get(book.uuid)
    if (!formats?.size) {
      return []
    }

    const newFormats = newFormatsByBook.get(book.uuid) ?? new Set<ScanFormat>()
    const makeFlags = (format: ScanFormat): ScanFlag[] =>
      newFormats.has(format) ? ["new"] : []

    const entries = []
    if (formats.has("ebook") && book.ebook?.filepath) {
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

    if (formats.has("audiobook") && book.audiobook?.filepath) {
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

    if (formats.has("readaloud") && book.readaloud?.filepath) {
      entries.push(
        createScanContext({
          bookUuid: book.uuid,
          format: "readaloud",
          filepath: book.readaloud.filepath,
          missing: book.readaloud.missing,
          existingHash: book.readaloud.contentHash ?? null,
          flags: makeFlags("readaloud"),
          book,
        }),
      )
    }

    return entries
  })

  if (!contexts.length) {
    logger.debug(`No scan contexts generated for ${importPath}`)
    return
  }

  await runBookScanPipeline(contexts, {
    concurrency: 2,
    onProgress: (processed, total) => {
      logger.debug(`Scanning ${importPath}: (${processed}/${total})`)
    },
    signal,
  })
  await updateReadaloudMissingState(
    refreshedBooks.filter((book) => affectedFormatsByBook.has(book.uuid)),
    signal,
  )
  logger.info(
    `Incremental scan complete for ${importPath}. processed ${affectedFormatsByBook.size} book(s)`,
  )
}
