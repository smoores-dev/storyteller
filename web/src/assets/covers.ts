import { open, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { basename, extname, join } from "node:path"
import { UUID } from "@/uuid"
import { BookWithRelations, getBookOrThrow } from "@/database/books"
import { COVER_IMAGE_FILE_EXTENSIONS, isAudioFile } from "@/audio"
import { Audiobook } from "@smoores/audiobook/node"
import { getProcessedAudioFiles } from "./fs"
import { getProcessedAudioFilepath } from "./paths"
import { Epub } from "@smoores/epub/node"
import { getAudioCoverItem } from "@/process/processEpub"
import { extension, lookup } from "mime-types"

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
    audiobook.close()
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
      cover = join(directory, entry)
    }
    if (
      name.toLowerCase() === "audio cover" &&
      COVER_IMAGE_FILE_EXTENSIONS.includes(ext)
    ) {
      audioCover = join(directory, entry)
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

export async function getAudioCoverFromCustomFile(book: BookWithRelations) {
  if (!book.audiobook) return null
  const customCoverFilepath = await getAudioCoverFilepath(book)

  if (!customCoverFilepath) return null
  const file = await open(customCoverFilepath)
  const stats = await file.stat()
  const data = await file.readFile()
  await file.close()
  return {
    filename: basename(customCoverFilepath),
    mimeType: lookup(customCoverFilepath) || "image/jpeg",
    stats,
    data,
  }
}

export async function getAudioCoverFromReadaloud(book: BookWithRelations) {
  if (!book.readaloud?.filepath) return null

  const epub = await Epub.from(book.readaloud.filepath)

  const coverImageItem = await getAudioCoverItem(epub)
  if (!coverImageItem) {
    await epub.close()
    return null
  }

  const data = await epub.readItemContents(coverImageItem.id)
  await epub.close()

  const file = await open(book.readaloud.filepath)
  const stats = await file.stat()
  await file.close()
  return {
    filename: basename(coverImageItem.href),
    mimeType: coverImageItem.mediaType ?? "image/jpeg",
    stats: stats,
    data: Buffer.from(data),
  }
}

export async function getAudioCoverFromReadaloudAudio(book: BookWithRelations) {
  if (!book.readaloud?.filepath) return null

  const epub = await Epub.from(book.readaloud.filepath)

  const manifest = await epub.getManifest()
  // TODO: Would be better to get the first audio file that
  // actually corresponds to a media overlay
  const firstAudioItem = Object.values(manifest).find((item) =>
    item.mediaType?.startsWith("audio/"),
  )
  if (!firstAudioItem) return null

  const audio = await epub.readItemContents(firstAudioItem.id)
  const audiobook = await Audiobook.from({
    filename: firstAudioItem.href,
    data: audio,
  })
  const coverArt = await audiobook.getCoverArt()
  audiobook.close()
  if (!coverArt) return null

  const file = await open(book.readaloud.filepath)
  const stats = await file.stat()
  await file.close()
  return {
    filename: coverArt.filename || `Cover.${extension(coverArt.mimeType)}`,
    mimeType: coverArt.mimeType,
    stats,
    data: Buffer.from(coverArt.data.toByteArray()),
  }
}

export async function getAudioCoverFromAudiobook(book: BookWithRelations) {
  if (!book.audiobook) return null
  const directory = book.audiobook.filepath

  const entries = await readdir(directory, { recursive: true })

  const firstCover = await Promise.any(
    entries
      .filter((entry) => isAudioFile(entry))
      .map((relativeTrack) => join(directory, relativeTrack))
      .map((path) =>
        Audiobook.from(path).then(async (audiobook) => {
          const coverArt = await audiobook.getCoverArt()
          audiobook.close()
          if (!coverArt) throw new Error()
          return { audiofile: path, picture: coverArt }
        }),
      ),
  ).catch(() => null)

  if (!firstCover) return null

  const file = await open(firstCover.audiofile)
  const stats = await file.stat()
  await file.close()
  return {
    filename:
      firstCover.picture.filename ||
      `Cover.${extension(firstCover.picture.mimeType)}`,
    mimeType: firstCover.picture.mimeType,
    stats,
    data: Buffer.from(firstCover.picture.data.toByteArray()),
  }
}

export async function getAudioCover(book: BookWithRelations) {
  const strategies = [
    getAudioCoverFromReadaloud,
    getAudioCoverFromReadaloudAudio,
    getAudioCoverFromCustomFile,
    getAudioCoverFromAudiobook,
  ]
  for (const strategy of strategies) {
    const cover = await strategy(book)
    if (cover) return cover
  }
  return null
}

export async function getEpubCover(book: BookWithRelations) {
  const epubFilepath = book.readaloud?.filepath ?? book.ebook?.filepath
  if (!epubFilepath) return null

  if (!epubFilepath) return null
  const epub = await Epub.from(epubFilepath)
  const coverImageItem = await epub.getCoverImageItem()
  if (!coverImageItem) return null
  const data = await epub.getCoverImage()
  if (!data) return null

  const epubFile = await open(epubFilepath)
  const stats = await epubFile.stat()
  await epubFile.close()

  return {
    filename: basename(coverImageItem.href),
    mimeType:
      coverImageItem.mediaType ?? (lookup(coverImageItem.href) || "image/jpeg"),
    data: Buffer.from(data) as Buffer,
    stats,
  }
}

export async function writeMetadataToAudiobook(
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
  await audiobook.setAuthors(book.authors.map((author) => author.name))
  await audiobook.setNarrators(book.narrators.map((narrator) => narrator.name))
  await audiobook.setTitle(book.title)
  if (book.subtitle) {
    await audiobook.setSubtitle(book.subtitle)
  }
  if (book.description) {
    await audiobook.setDescription(book.description)
  }
  await audiobook.save()
  audiobook.close()

  try {
    const processedTracks = (await getProcessedAudioFiles(book)).map((track) =>
      join(getProcessedAudioFilepath(book), track),
    )
    const processedAudiobook = await Audiobook.from(processedTracks)
    await audiobook.setCoverArt(coverPath)
    await audiobook.setAuthors(book.authors.map((author) => author.name))
    await audiobook.setNarrators(
      book.narrators.map((narrator) => narrator.name),
    )
    await audiobook.setTitle(book.title)
    if (book.description) {
      await audiobook.setDescription(book.description)
    }
    await processedAudiobook.save()
    audiobook.close()
  } catch {
    // We might not have any processed audio files yet, which is fine
  }
}
