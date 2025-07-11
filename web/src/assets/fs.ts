import { Book, BookWithRelations, updateBook } from "@/database/books"
import {
  getDefaultSuffix,
  getInternalBookDirectory,
  getInternalEpubAlignedFilepath,
  getInternalEpubFilepath,
  getInternalOriginalAudioFilepath,
  getProcessedAudioFilepath,
  getTranscriptionsFilepath,
} from "./paths"
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises"
import { isAudioFile } from "@/audio"
import { dirname } from "node:path"

export async function getProcessedAudioFiles(book: Book) {
  const directory = getProcessedAudioFilepath(book)

  const entries = await readdir(directory, { recursive: true })
  return entries.filter((path) => isAudioFile(path))
}

export async function persistEpub(
  book: Book,
  tmpPath: string,
  aligned?: boolean,
) {
  const filepath = aligned
    ? getInternalEpubAlignedFilepath(book)
    : getInternalEpubFilepath(book)

  try {
    await mkdir(getInternalBookDirectory(book))
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "EEXIST") {
      book = await updateBook(book.uuid, {
        suffix: getDefaultSuffix(book.uuid),
      })
      await persistEpub(book, tmpPath, aligned)
      return
    }

    throw e
  }

  const directory = dirname(filepath)
  await mkdir(directory, { recursive: true })
  await rename(tmpPath, filepath)
  await updateBook(book.uuid, null, {
    ...(aligned
      ? {
          alignedBook: {
            filepath,
          },
        }
      : { ebook: { filepath } }),
  })
}

export async function persistAudio(
  book: BookWithRelations,
  tmpPath: string,
  relativePath: string,
) {
  const filepath = getInternalOriginalAudioFilepath(book, relativePath)

  try {
    await mkdir(getInternalBookDirectory(book))
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "EEXIST") {
      book = await updateBook(book.uuid, {
        suffix: getDefaultSuffix(book.uuid),
      })
      await persistAudio(book, tmpPath, relativePath)
      return
    }

    throw e
  }

  const directory = getInternalOriginalAudioFilepath(book)
  await mkdir(directory, { recursive: true })
  await rename(tmpPath, filepath)
  await updateBook(book.uuid, null, { audiobook: { filepath: directory } })
}

export async function originalEpubExists(book: BookWithRelations) {
  if (!book.ebook) return false
  try {
    await stat(book.ebook.filepath)
    return true
  } catch {
    return false
  }
}

export async function originalAudioExists(book: BookWithRelations) {
  if (!book.audiobook) return false
  const originalAudioDirectory = book.audiobook.filepath
  try {
    const filenames = await readdir(originalAudioDirectory)

    return filenames.some((filename) => {
      return filename.endsWith(".zip") || isAudioFile(filename)
    })
  } catch {
    return false
  }
}

export async function deleteProcessed(book: BookWithRelations) {
  await Promise.all([
    rm(getProcessedAudioFilepath(book), {
      recursive: true,
      force: true,
    }),
    rm(getTranscriptionsFilepath(book), {
      recursive: true,
      force: true,
    }),
  ])
}

export async function deleteOriginals(book: BookWithRelations) {
  await Promise.all([
    ...(book.ebook ? [rm(book.ebook.filepath, { force: true })] : []),
    ...(book.audiobook
      ? [
          rm(book.audiobook.filepath, {
            recursive: true,
            force: true,
          }),
        ]
      : []),
  ])
}

export async function deleteAssets(book: BookWithRelations) {
  await Promise.all([
    deleteOriginals(book),
    deleteProcessed(book),
    ...(book.alignedBook?.filepath ? [rm(book.alignedBook.filepath)] : []),
  ])
}
