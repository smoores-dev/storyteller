import { readdir, readFile, rm, writeFile } from "node:fs/promises"
import { basename, extname, join } from "node:path"
import { UUID } from "@/uuid"
import { BookWithRelations, getBookOrThrow } from "@/database/books"
import { COVER_IMAGE_FILE_EXTENSIONS, isAudioFile } from "@/audio"
import { Audiobook } from "@smoores/audiobook"
import { getProcessedAudioFiles } from "./fs"
import { getProcessedAudioFilepath } from "./paths"

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

  const firstTrack = entries.find((entry) => isAudioFile(entry))
  if (!firstTrack) return null

  try {
    const audiobook = await Audiobook.from(join(directory, firstTrack))
    const coverImage = await audiobook.getCoverArt()
    if (!coverImage) return null

    return {
      data: coverImage.data.toByteArray(),
      format: coverImage.mimeType,
      audiofile: join(directory, firstTrack),
    }
  } catch {
    return null
  }
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

export async function writeCoverToAudio(
  book: BookWithRelations,
  coverPath: string,
) {
  if (!book.audiobook) return
  const directory = book.audiobook.filepath
  const entries = await readdir(directory, { recursive: true })

  const tracks = entries
    .filter((entry) => isAudioFile(entry))
    .map((track) => join(directory, track))
  const audiobook = await Audiobook.from(tracks)
  await audiobook.setCoverArt(coverPath)
  await audiobook.save()

  try {
    const processedTracks = (await getProcessedAudioFiles(book)).map((track) =>
      join(getProcessedAudioFilepath(book), track),
    )
    const processedAudiobook = await Audiobook.from(processedTracks)
    await processedAudiobook.setCoverArt(coverPath)
    await processedAudiobook.save()
  } catch {
    // We might not have any processed audio files yet, which is fine
  }
}
