import { readdir, readFile, rm, writeFile } from "node:fs/promises"
import { basename, extname, join } from "node:path"
import { UUID } from "@/uuid"
import { BookWithRelations, getBookOrThrow } from "@/database/books"
import { AUDIO_FILE_EXTENSIONS, COVER_IMAGE_FILE_EXTENSIONS } from "@/audio"
import { parseFile, selectCover } from "music-metadata"

export type AudioFile = {
  filename: string
  bare_filename: string
  extension: string
}

export type AudioIndex = {
  cover?: string
  processed_files?: AudioFile[]
}

export async function getFirstCoverImage(directory: string) {
  const entries = await readdir(directory, { recursive: true })

  const firstTrack = entries.find((entry) =>
    AUDIO_FILE_EXTENSIONS.includes(extname(entry)),
  )
  if (!firstTrack) return null

  const { common } = await parseFile(join(directory, firstTrack))
  const coverImage = selectCover(common.picture)
  if (!coverImage) return null

  return coverImage.data
}

async function findValidAudioCoverFile(directory: string) {
  const entries = await readdir(directory, { recursive: true })

  let cover: null | string = null
  let audioCover: null | string = null
  let epub: null | string = null

  for (const entry of entries) {
    const ext = extname(entry)
    const name = basename(entry, ext)
    if (
      name.toLowerCase() === "cover" &&
      COVER_IMAGE_FILE_EXTENSIONS.includes(ext)
    ) {
      cover = entry
    }
    if (
      name.toLowerCase() === "audio cover" &&
      COVER_IMAGE_FILE_EXTENSIONS.includes(ext)
    ) {
      audioCover = entry
    }
    if (ext === ".epub") {
      epub = entry
    }
  }

  if (epub) return audioCover
  return audioCover ?? cover
}

export async function getAudioCoverFilepath(book: BookWithRelations) {
  const audioDirectory = book.audiobook?.filepath
  if (!audioDirectory) return null

  const coverFile = await findValidAudioCoverFile(audioDirectory)

  return coverFile
}

export async function persistCustomAudioCover(
  bookUuid: UUID,
  filename: string,
  cover: Uint8Array,
) {
  const book = await getBookOrThrow(bookUuid)
  const audioDirectory = book.audiobook?.filepath
  if (!audioDirectory) return

  const coverFile = await findValidAudioCoverFile(audioDirectory)
  if (coverFile) {
    await rm(join(audioDirectory, coverFile))
  }

  await writeFile(join(audioDirectory, filename), cover)
}

export async function getCustomAudioCover(book: BookWithRelations) {
  const filepath = await getAudioCoverFilepath(book)
  if (filepath === null) return null

  const buffer = await readFile(filepath)
  return new Uint8Array(buffer)
}
