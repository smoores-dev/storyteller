import { mkdir } from "node:fs/promises"
import { basename, dirname, extname } from "node:path"

import { type Audiobook } from "@storyteller-platform/audiobook"
import { type Epub } from "@storyteller-platform/epub"

import { move, persistAudio, persistEpub } from "@/assets/fs"
import {
  getInternalAudioDirectory,
  getInternalOriginalAudioFilepath,
} from "@/assets/paths"
import {
  type BookWithRelations,
  createBookFromAudiobook,
  createBookFromEpub,
  updateBook,
} from "@/database/books"
import { type UUID } from "@/uuid"

export async function handleEpubNewBook(
  bookUuid: UUID,
  filename: string,
  uploadPath: string,
  epub: Epub,
  collectionUuid: UUID | undefined,
  isAligned: boolean,
) {
  const book = await createBookFromEpub(
    epub,
    { uuid: bookUuid, title: basename(filename, ".epub") },
    {
      ...(collectionUuid && { collections: [collectionUuid] }),
    },
  )

  return await persistEpub(book, uploadPath, isAligned)
}

export async function handleEpubExistingBook(
  book: BookWithRelations,
  uploadPath: string,
  isAligned: boolean,
) {
  const persisted = await persistEpub(book, uploadPath, isAligned)

  if (!book.audiobook) return persisted

  // The audio was uploaded/processed first, and it's going to
  // potentially have an arbitrary book directory name. Better
  // to use the one from the ebook
  await move(
    getInternalAudioDirectory(book),
    getInternalAudioDirectory(persisted),
  )

  return await updateBook(persisted.uuid, null, {
    audiobook: { filepath: getInternalAudioDirectory(persisted) },
  })
}

export async function handleAudiobookNewBook(
  bookUuid: UUID,
  relativePath: string,
  uploadPath: string,
  audiobook: Audiobook,
  collectionUuid: UUID | undefined,
) {
  const book = await createBookFromAudiobook(
    audiobook,
    {
      uuid: bookUuid,
      title: basename(relativePath, extname(relativePath)),
    },
    {
      ...(collectionUuid && { collections: [collectionUuid] }),
    },
  )

  return await persistAudio(book, uploadPath, relativePath)
}

export async function handleAudiobookExistingBook(
  book: BookWithRelations,
  relativePath: string,
  uploadPath: string,
) {
  const filepath = getInternalOriginalAudioFilepath(book, relativePath)

  await mkdir(dirname(filepath), { recursive: true })

  let updated: BookWithRelations | null = null
  if (!book.audiobook) {
    updated = await updateBook(book.uuid, null, {
      audiobook: {
        filepath: getInternalOriginalAudioFilepath(book),
      },
    })
  }

  await move(uploadPath, filepath)

  return updated ?? book
}
