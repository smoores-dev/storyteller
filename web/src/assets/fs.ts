import { createHash } from "node:crypto"
import { type Stats } from "node:fs"
import {
  cp,
  link,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import { dirname, join } from "node:path"

import { AsyncMutex } from "@esfx/async-mutex"
import { reflinkFile } from "@reflink/reflink"

import { getFileChunks } from "@storyteller-platform/fs"

import { isAudioFile } from "@/audio"
import { type Book, type BookWithRelations, updateBook } from "@/database/books"
import { db } from "@/database/connection"
import { ASSETS_DIR } from "@/directories"
import { logger } from "@/logging"
import { type UUID } from "@/uuid"

import { pathBelongsTo } from "./library/scanner/folder"
import {
  suppressPrefix,
  unsuppressPrefix,
} from "./library/scanner/write-intent"
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

/**
 * Reserve a unique on-disk directory for this book. checks the DB for
 * asset_dir collisions (rather than relying on filesystem EEXIST) and
 * bumps to a uuid-derived suffix when needed.
 */
export async function reserveBookDirectory(
  book: BookWithRelations,
): Promise<BookWithRelations> {
  const desired = getSafeFilepathSegment(book.title)

  const collision = await db
    .selectFrom("book")
    .select(["uuid"])
    .where("assetDir", "=", desired)
    .where("uuid", "!=", book.uuid)
    .executeTakeFirst()

  const folder = collision
    ? getSafeFilepathSegment(book.title, getDefaultSuffix(book.uuid))
    : desired

  const updated = await updateBook(book.uuid, { assetDir: folder })
  await mkdir(getInternalBookDirectory(updated), { recursive: true })
  return updated
}

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

/** Hard-link a file, falling back to regular copy for cross-device sources. */
export async function copyWithHardlink(source: string, destination: string) {
  try {
    await link(source, destination)
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "EXDEV") {
      await cp(source, destination)
    } else {
      throw e
    }
  }
}
// Devices where reflink is known to be unsupported, so we only
// attempt (and fail) once per filesystem per process lifetime.
const reflinkUnsupportedDevices = new Set<number>()
/**
 * Copy a file using reflink (copy-on-write) when the filesystem supports it,
 * falling back to a regular copy otherwise. Remembers which device IDs don't
 * support reflink so subsequent copies on the same filesystem skip straight
 * to regular copy.
 */
export async function copyWithReflink(source: string, destination: string) {
  const sourceDev = (await stat(source)).dev
  const destDev = (await stat(dirname(destination))).dev
  // Reflink only works within the same filesystem, and we track
  // filesystems where it's known not to be supported.
  if (sourceDev !== destDev || reflinkUnsupportedDevices.has(sourceDev)) {
    await cp(source, destination)
    return
  }
  try {
    await reflinkFile(source, destination)
  } catch {
    reflinkUnsupportedDevices.add(sourceDev)
    await cp(source, destination)
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
): Promise<BookWithRelations> {
  if (book.title !== updated.title) {
    const desired = getSafeFilepathSegment(updated.title)

    const collision = await db
      .selectFrom("book")
      .select(["uuid"])
      .where("assetDir", "=", desired)
      .where("uuid", "!=", updated.uuid)
      .executeTakeFirst()

    const newFolder = collision
      ? getSafeFilepathSegment(updated.title, getDefaultSuffix(updated.uuid))
      : desired

    updated = await updateBook(updated.uuid, { assetDir: newFolder })

    const oldDir = getInternalBookDirectory(book)
    const newDir = getInternalBookDirectory(updated)
    await move(oldDir, newDir)

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
  book: BookWithRelations,
  tmpPath: string,
  aligned?: boolean,
) {
  const reserved = await reserveBookDirectory(book)
  const filepath = aligned
    ? getInternalReadaloudFilepath(reserved)
    : getInternalEpubFilepath(reserved)

  const directory = dirname(filepath)
  await mkdir(directory, { recursive: true })
  await move(tmpPath, filepath)

  return updateBook(reserved.uuid, null, {
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
  const reserved = await reserveBookDirectory(book)
  const filepath = getInternalOriginalAudioFilepath(reserved, relativePath)

  const directory = dirname(filepath)
  await mkdir(directory, { recursive: true })
  await move(tmpPath, filepath)

  const updated = await updateBook(reserved.uuid, null, {
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
  await deleteProcessedAudio(book)
  await deleteTranscriptions(book)
}

export async function deleteTranscriptions(book: BookWithRelations) {
  const transcriptionsDir = getTranscriptionsFilepath(book)
  suppressPrefix(transcriptionsDir)
  await rm(getTranscriptionsFilepath(book), {
    recursive: true,
    force: true,
  })
  unsuppressPrefix(transcriptionsDir)
}

export async function deleteProcessedAudio(book: BookWithRelations) {
  const processedAudioDir = getProcessedAudioFilepath(book)
  suppressPrefix(processedAudioDir)
  await rm(processedAudioDir, {
    recursive: true,
    force: true,
  })
  unsuppressPrefix(processedAudioDir)
}

export async function deleteOriginals(book: BookWithRelations) {
  if (book.ebook) {
    suppressPrefix(book.ebook.filepath)
    await rm(book.ebook.filepath, { force: true })
    unsuppressPrefix(book.ebook.filepath)
  }
  if (book.audiobook) {
    suppressPrefix(book.audiobook.filepath)
    await rm(book.audiobook.filepath, {
      recursive: true,
      force: true,
    })
    unsuppressPrefix(book.audiobook.filepath)
  }
}

/**
 * Library-owned assets are deleted. Reference-mode
 * source files (ebook/audiobook outside ASSETS_DIR) are left on disk.
 */
export async function deleteAssets(book: BookWithRelations) {
  const bookDir = getInternalBookDirectory(book)
  suppressPrefix(bookDir)
  await rm(bookDir, { recursive: true, force: true })
  unsuppressPrefix(bookDir)

  if (
    book.readaloud?.filepath &&
    pathBelongsTo(ASSETS_DIR, book.readaloud.filepath)
  ) {
    suppressPrefix(book.readaloud.filepath)
    await rm(book.readaloud.filepath, { force: true })
    unsuppressPrefix(book.readaloud.filepath)
  }

  if (book.ebook && pathBelongsTo(ASSETS_DIR, book.ebook.filepath)) {
    suppressPrefix(book.ebook.filepath)
    await rm(book.ebook.filepath, { force: true })
    unsuppressPrefix(book.ebook.filepath)
  }
  if (book.audiobook && pathBelongsTo(ASSETS_DIR, book.audiobook.filepath)) {
    suppressPrefix(book.audiobook.filepath)
    await rm(book.audiobook.filepath, { recursive: true, force: true })
    unsuppressPrefix(book.audiobook.filepath)
  }

  await deleteCachedCoverImages(book.uuid)
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

export async function deleteCachedCoverImagesByKind(
  uuid: UUID,
  kind: "text" | "audio",
) {
  const dir = join(getCoverImageCacheDirectory(uuid), kind)
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
