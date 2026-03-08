import { createHash } from "node:crypto"
import { type Stats } from "node:fs"
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import { dirname, join } from "node:path"

import { AsyncMutex } from "@esfx/async-mutex"

import { getFileChunks } from "@storyteller-platform/fs"

import { isAudioFile } from "@/audio"
import { type Book, type BookWithRelations, updateBook } from "@/database/books"
import { logger } from "@/logging"
import { type UUID } from "@/uuid"

import {
  getCachedCoverImageDirectory,
  getCoverImageCacheDirectory,
  getDefaultSuffix,
  getInternalAudioDirectory,
  getInternalBookDirectory,
  getInternalEpubDirectory,
  getInternalEpubFilepath,
  getInternalOriginalAudioFilepath,
  getInternalReadaloudDirectory,
  getInternalReadaloudFilepath,
  getProcessedAudioFilepath,
  getSafeFilepathSegment,
  getTranscriptionsFilepath,
} from "./paths"

export async function move(source: string, destination: string) {
  await cp(source, destination, { recursive: true })
  try {
    await rm(source, { recursive: true })
  } catch (e) {
    logger.error(`Failed to move file from ${source} to ${destination}`)
    logger.error(e)
    try {
      await rm(destination)
    } catch {
      /* empty */
    }
    throw e
  }
}

export async function getProcessedAudioFiles(book: Book) {
  const directory = getProcessedAudioFilepath(book)

  const entries = await readdir(directory, { recursive: true })
  return entries.filter((path) => isAudioFile(path))
}

export async function renameBookAssets(
  book: BookWithRelations,
  updated: BookWithRelations,
) {
  if (book.title !== updated.title) {
    try {
      await move(
        getInternalBookDirectory(book),
        getInternalBookDirectory(updated),
      )
    } catch (e) {
      if (
        e instanceof Error &&
        "code" in e &&
        (e.code === "EEXIST" || e.code === "ENOTEMPTY")
      ) {
        updated = await updateBook(updated.uuid, {
          suffix: getDefaultSuffix(updated.uuid),
        })
        return renameBookAssets(book, updated)
      }

      throw e
    }
    if (updated.ebook?.filepath === getInternalEpubFilepath(book)) {
      await move(
        join(
          getInternalEpubDirectory(updated),
          getSafeFilepathSegment(book.title, ".epub"),
        ),
        getInternalEpubFilepath(updated),
      )
    }
    if (updated.readaloud?.filepath === getInternalReadaloudFilepath(book)) {
      await move(
        join(
          getInternalReadaloudDirectory(updated),
          getSafeFilepathSegment(book.title, ".epub"),
        ),
        getInternalReadaloudFilepath(updated),
      )
    }
    return await updateBook(updated.uuid, null, {
      ...(updated.ebook?.filepath === getInternalEpubFilepath(book) && {
        ebook: { filepath: getInternalEpubFilepath(updated) },
      }),
      ...(updated.audiobook?.filepath === getInternalAudioDirectory(book) && {
        audiobook: { filepath: getInternalAudioDirectory(updated) },
      }),
      ...(updated.readaloud?.filepath ===
        getInternalReadaloudFilepath(book) && {
        readaloud: {
          filepath: getInternalReadaloudFilepath(updated),
          currentStage: book.readaloud?.currentStage ?? "SPLIT_TRACKS",
        },
      }),
    })
  }

  return updated
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
  await move(tmpPath, filepath)

  return updateBook(book.uuid, null, {
    ...(aligned
      ? {
          readaloud: {
            filepath,
            status: "ALIGNED",
            currentStage: "SPLIT_TRACKS",
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

  const directory = dirname(filepath)
  await mkdir(directory, { recursive: true })
  await move(tmpPath, filepath)

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

export async function deleteTranscriptions(book: BookWithRelations) {
  await rm(getTranscriptionsFilepath(book), {
    recursive: true,
    force: true,
  })
}

export async function deleteProcessedAudio(book: BookWithRelations) {
  await rm(getProcessedAudioFilepath(book), {
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

const cachedCoverImageLocks = new Map<string, AsyncMutex>()

export async function getCachedCoverImage(
  uuid: UUID,
  kind: "text" | "audio",
  height: number,
  width: number,
) {
  try {
    const dir = getCachedCoverImageDirectory(uuid, kind, height, width)
    const lock = cachedCoverImageLocks.get(dir) ?? new AsyncMutex()
    cachedCoverImageLocks.set(dir, lock)

    await using stack = new AsyncDisposableStack()
    stack.defer(() => {
      lock.unlock()
    })

    await lock.lock()
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
  const lock = cachedCoverImageLocks.get(dir) ?? new AsyncMutex()
  cachedCoverImageLocks.set(dir, lock)

  await using stack = new AsyncDisposableStack()
  stack.defer(() => {
    lock.unlock()
  })

  await lock.lock()
  await mkdir(join(dir), { recursive: true })
  await writeFile(join(dir, "info.json"), infoJSON, { encoding: "utf-8" })
  await writeFile(join(dir, image.filename), image.data)
}

export async function deleteCachedCoverImages(uuid: UUID) {
  const dir = getCoverImageCacheDirectory(uuid)
  await rm(dir, { recursive: true, force: true })
}

export async function computeFileHash(filePath: string): Promise<string> {
  const hash = createHash("sha256")

  // Use the stream from @storyteller-platform/fs
  // to avoid memory overhead and Node.js file limits.
  for await (const chunk of getFileChunks(filePath)) {
    hash.update(chunk)
  }

  return hash.digest("hex")
}
