import { Book, BookWithRelations, updateBook } from "@/database/books"
import {
  getCachedCoverImageDirectory,
  getCoverImageCacheDirectory,
  getDefaultSuffix,
  getInternalBookDirectory,
  getInternalReadaloudFilepath,
  getInternalEpubFilepath,
  getInternalOriginalAudioFilepath,
  getProcessedAudioFilepath,
  getTranscriptionsFilepath,
} from "./paths"
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import { isAudioFile } from "@/audio"
import { dirname, join } from "node:path"
import { Stats } from "node:fs"
import { UUID } from "@/uuid"

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
    ? getInternalReadaloudFilepath(book)
    : getInternalEpubFilepath(book)

  try {
    await mkdir(getInternalBookDirectory(book))
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "EEXIST") {
      book = await updateBook(book.uuid, {
        suffix: getDefaultSuffix(book.uuid),
      })
      return persistEpub(book, tmpPath, aligned)
    }

    throw e
  }

  const directory = dirname(filepath)
  await mkdir(directory, { recursive: true })
  await rename(tmpPath, filepath)
  return updateBook(book.uuid, null, {
    ...(aligned
      ? {
          readaloud: {
            filepath,
            status: "ALIGNED",
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
      return persistAudio(book, tmpPath, relativePath)
    }

    throw e
  }

  const directory = getInternalOriginalAudioFilepath(book)
  await mkdir(directory, { recursive: true })
  await rename(tmpPath, filepath)
  const updated = await updateBook(book.uuid, null, {
    audiobook: { filepath: directory },
  })
  return updated
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
  await rm(getProcessedAudioFilepath(book), {
    recursive: true,
    force: true,
  })
  await rm(getTranscriptionsFilepath(book), {
    recursive: true,
    force: true,
  })
}

export async function deleteOriginals(book: BookWithRelations) {
  if (book.ebook) {
    await rm(book.ebook.filepath, { force: true })
  }
  if (book.audiobook) {
    await rm(book.audiobook.filepath, {
      recursive: true,
      force: true,
    })
  }
}

export async function deleteAssets(
  book: BookWithRelations,
  { all }: { all?: boolean } = {},
) {
  if (!all) {
    await deleteProcessed(book)
    return
  }

  await rm(getInternalBookDirectory(book), { recursive: true, force: true })
  if (book.readaloud?.filepath) {
    await rm(book.readaloud.filepath)
  }
  await deleteOriginals(book)
}

export async function getCachedCoverImage(
  uuid: UUID,
  kind: "text" | "audio",
  height: number,
  width: number,
) {
  try {
    const dir = getCachedCoverImageDirectory(uuid, kind, height, width)
    const infoJSON = await readFile(join(dir, "info.json"), {
      encoding: "utf-8",
    })
    const { filename, mimeType, stats } = JSON.parse(infoJSON) as {
      filename: string
      mimeType: string
      stats: Stats
    }
    const data = await readFile(join(dir, filename))
    return { filename, stats, mimeType, data }
  } catch {
    return null
  }
}

export async function writeCachedCoverImage(
  uuid: UUID,
  kind: "text" | "audio",
  height: number,
  width: number,
  image: { filename: string; mimeType: string; stats: Stats; data: Buffer },
) {
  const infoJSON = JSON.stringify({
    filename: image.filename,
    mimeType: image.mimeType,
    stats: image.stats,
  })
  const dir = getCachedCoverImageDirectory(uuid, kind, height, width)
  await mkdir(join(dir), { recursive: true })
  await writeFile(join(dir, "info.json"), infoJSON, { encoding: "utf-8" })
  await writeFile(join(dir, image.filename), image.data)
}

export async function deleteCachedCoverImages(uuid: UUID) {
  const dir = getCoverImageCacheDirectory(uuid)
  await rm(dir, { recursive: true, force: true })
}
