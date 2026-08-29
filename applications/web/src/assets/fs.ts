import { createHash } from "node:crypto"
import { cp, link, mkdir, readdir, rm, stat } from "node:fs/promises"
import { dirname, join } from "node:path"

import { reflinkFile } from "@reflink/reflink"

import { getFileChunks } from "@storyteller-platform/fs"

import { isAudioFile } from "@/audio"
import {
  type Book,
  type BookWithRelations,
  removeBookFormat,
  updateBook,
} from "@/database/books"
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
  getCoverImageCacheDirectory,
  getDefaultSuffix,
  getEmissionsFilepath,
  getInternalAudioDirectory,
  getInternalBookDirectory,
  getInternalEpubDirectory,
  getInternalEpubFilepath,
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

export type AssetDirConflict =
  | {
      kind: "owned_by_another_book"
      ownerUuid: UUID
      ownerTitle: string
    }
  | {
      kind: "files_exist_on_disk"
      existingFiles: {
        ebook?: string
        audiobook?: string
        readaloud?: string
      }
    }

export type ConflictResolution = {
  ebook?: "current" | "target"
  audiobook?: "current" | "target"
  readaloud?: "current" | "target"
}

export async function changeBookAssetDir(
  book: BookWithRelations,
  newAssetDir: string,
  resolution?: ConflictResolution,
): Promise<{ book: BookWithRelations } | { conflict: AssetDirConflict }> {
  if (newAssetDir === book.assetDir) {
    return { book }
  }

  const collision = await db
    .selectFrom("book")
    .select(["uuid", "title"])
    .where("assetDir", "=", newAssetDir)
    .where("uuid", "!=", book.uuid)
    .executeTakeFirst()

  if (collision) {
    return {
      conflict: {
        kind: "owned_by_another_book",
        ownerUuid: collision.uuid,
        ownerTitle: collision.title,
      },
    }
  }

  const targetDir = join(ASSETS_DIR, newAssetDir)
  const targetExists = await exist(targetDir)

  if (targetExists && !resolution) {
    const existingFiles = await scanFolderFormats(targetDir)

    if (
      existingFiles.ebook ||
      existingFiles.audiobook ||
      existingFiles.readaloud
    ) {
      return {
        conflict: {
          kind: "files_exist_on_disk",
          existingFiles,
        },
      }
    }
  }

  const oldDir = getInternalBookDirectory(book)
  const oldDirExists = await exist(oldDir)

  if (targetExists && resolution) {
    await mergeIntoTarget(oldDir, targetDir, resolution)
  } else if (oldDirExists) {
    suppressPrefix(oldDir)
    suppressPrefix(targetDir)
    try {
      await move(oldDir, targetDir)
    } finally {
      unsuppressPrefix(oldDir)
      unsuppressPrefix(targetDir)
    }
  } else {
    await mkdir(targetDir, { recursive: true })
  }

  let updated = await updateBook(book.uuid, { assetDir: newAssetDir })

  updated = await rewriteInternalPaths(book, updated)

  return { book: updated }
}

async function mergeIntoTarget(
  oldDir: string,
  targetDir: string,
  resolution: ConflictResolution,
) {
  const oldDirExists = await exist(oldDir)
  if (!oldDirExists) return

  suppressPrefix(oldDir)
  suppressPrefix(targetDir)

  try {
    const entries = await readdir(oldDir, { withFileTypes: true })

    for (const entry of entries) {
      const src = join(oldDir, entry.name)
      const dest = join(targetDir, entry.name)

      const shouldSkip = shouldSkipForResolution(entry.name, oldDir, resolution)
      if (shouldSkip) continue

      if (entry.isDirectory()) {
        await cp(src, dest, { recursive: true, force: true })
      } else {
        await cp(src, dest, { force: true })
      }
    }

    await rm(oldDir, { recursive: true, force: true })
  } finally {
    unsuppressPrefix(oldDir)
    unsuppressPrefix(targetDir)
  }
}

function shouldSkipForResolution(
  name: string,
  _oldDir: string,
  resolution: ConflictResolution,
): boolean {
  if (name === "text" && resolution.ebook === "target") return true
  if (name === "audio" && resolution.audiobook === "target") return true
  if (name === "aligned" && resolution.readaloud === "target") return true

  return false
}

async function rewriteInternalPaths(
  before: BookWithRelations,
  after: BookWithRelations,
): Promise<BookWithRelations> {
  const oldDir = join(ASSETS_DIR, before.assetDir)
  const newDir = getInternalBookDirectory(after)

  const relations: Parameters<typeof updateBook>[2] = {}

  if (before.ebook?.filepath && pathBelongsTo(oldDir, before.ebook.filepath)) {
    const relative = before.ebook.filepath.slice(oldDir.length)
    relations.ebook = { filepath: join(newDir, relative) }
  }

  if (
    before.audiobook?.filepath &&
    pathBelongsTo(oldDir, before.audiobook.filepath)
  ) {
    const relative = before.audiobook.filepath.slice(oldDir.length)
    relations.audiobook = { filepath: join(newDir, relative) }
  }

  if (
    before.readaloud?.filepath &&
    pathBelongsTo(oldDir, before.readaloud.filepath)
  ) {
    const relative = before.readaloud.filepath.slice(oldDir.length)
    relations.readaloud = {
      filepath: join(newDir, relative),
      currentStage: before.readaloud.currentStage,
    }
  }

  if (Object.keys(relations).length === 0) return after

  return await updateBook(after.uuid, null, relations)
}

async function scanFolderFormats(folder: string): Promise<{
  ebook?: string
  audiobook?: string
  readaloud?: string
}> {
  const result: { ebook?: string; audiobook?: string; readaloud?: string } = {}

  const textDir = join(folder, "text")
  const audioDir = join(folder, "audio")
  const alignedDir = join(folder, "aligned")

  if (await exist(textDir)) {
    try {
      const entries = await readdir(textDir)
      const epub = entries.find((e) => e.endsWith(".epub"))
      if (epub) result.ebook = join(textDir, epub)
    } catch {
      /* empty */
    }
  }

  if (await exist(audioDir)) {
    try {
      const entries = await readdir(audioDir)
      const hasAudio = entries.some((e) => isAudioFile(e))
      if (hasAudio) result.audiobook = audioDir
    } catch {
      /* empty */
    }
  }

  if (await exist(alignedDir)) {
    try {
      const entries = await readdir(alignedDir)
      const epub = entries.find((e) => e.endsWith(".epub"))
      if (epub) result.readaloud = join(alignedDir, epub)
    } catch {
      /* empty */
    }
  }

  return result
}

export type RelocateMode = "copy" | "move" | "hardlink"

export async function relocateToInternal(
  book: BookWithRelations,
  mode: RelocateMode = "copy",
): Promise<BookWithRelations> {
  const { addIgnoreRule } = await import("@/database/importRules")

  const reserved = await reserveBookDirectory(book)
  const relations: Parameters<typeof updateBook>[2] = {}
  const originalPaths: string[] = []

  if (
    reserved.ebook?.filepath &&
    !pathBelongsTo(ASSETS_DIR, reserved.ebook.filepath)
  ) {
    const src = reserved.ebook.filepath
    const dest = getInternalEpubFilepath(reserved)
    await mkdir(dirname(dest), { recursive: true })
    await transferFile(src, dest, mode)
    relations.ebook = { filepath: dest }
    originalPaths.push(src)
  }

  if (
    reserved.audiobook?.filepath &&
    !pathBelongsTo(ASSETS_DIR, reserved.audiobook.filepath)
  ) {
    const src = reserved.audiobook.filepath
    const dest = getInternalAudioDirectory(reserved)
    await mkdir(dest, { recursive: true })

    const entries = await readdir(src)
    for (const entry of entries) {
      if (isAudioFile(entry) || entry.endsWith(".zip")) {
        await transferFile(join(src, entry), join(dest, entry), mode)
      }
    }

    if (mode === "move") {
      await rm(src, { recursive: true, force: true })
    }

    relations.audiobook = { filepath: dest }
    originalPaths.push(src)
  }

  if (
    reserved.readaloud?.filepath &&
    !pathBelongsTo(ASSETS_DIR, reserved.readaloud.filepath)
  ) {
    const src = reserved.readaloud.filepath
    const dest = getInternalReadaloudFilepath(reserved)
    await mkdir(dirname(dest), { recursive: true })
    await transferFile(src, dest, mode)
    relations.readaloud = {
      filepath: dest,
      currentStage: reserved.readaloud.currentStage,
    }
    originalPaths.push(src)
  }

  if (Object.keys(relations).length === 0) return reserved

  for (const path of originalPaths) {
    await addIgnoreRule(path, {
      source: "import-relocate",
      bookUuid: reserved.uuid,
    })
  }

  return await updateBook(reserved.uuid, null, relations)
}

async function transferFile(src: string, dest: string, mode: RelocateMode) {
  switch (mode) {
    case "move":
      await move(src, dest)
      break
    case "hardlink":
      await copyWithHardlink(src, dest)
      break
    case "copy":
      await copyWithReflink(src, dest)
      break
  }
}

/**
 * Only called after merge, makes sure that the merged books' media files are moved into the target book's own folder if they are asset_dir files
 */
export async function relocateAssetsIntoBook(
  book: BookWithRelations,
): Promise<BookWithRelations> {
  const ownDir = getInternalBookDirectory(book)

  // library-owned (under ASSETS_DIR) but living outside this book's own folder
  const isMisplaced = (filepath: string) =>
    pathBelongsTo(ASSETS_DIR, filepath) && !pathBelongsTo(ownDir, filepath)

  const moves: { from: string; to: string }[] = []
  const relations: Parameters<typeof updateBook>[2] = {}

  if (book.ebook?.filepath && isMisplaced(book.ebook.filepath)) {
    const to = getInternalEpubFilepath(book)
    moves.push({ from: book.ebook.filepath, to })
    relations.ebook = { filepath: to }
  }
  if (book.readaloud?.filepath && isMisplaced(book.readaloud.filepath)) {
    const to = getInternalReadaloudFilepath(book)
    moves.push({ from: book.readaloud.filepath, to })
    relations.readaloud = {
      filepath: to,
      currentStage: book.readaloud.currentStage,
    }
  }
  if (book.audiobook?.filepath && isMisplaced(book.audiobook.filepath)) {
    const to = getInternalAudioDirectory(book)
    moves.push({ from: book.audiobook.filepath, to })
    relations.audiobook = { filepath: to }
  }

  if (!moves.length) return book

  for (const { from, to } of moves) {
    suppressPrefix(from)
    suppressPrefix(to)
    try {
      await move(from, to)
    } finally {
      unsuppressPrefix(from)
      unsuppressPrefix(to)
    }
  }

  return await updateBook(book.uuid, null, relations)
}

export async function deleteProcessed(book: BookWithRelations) {
  await deleteProcessedAudio(book)
  await deleteTranscriptions(book)
}

export function isReadaloudInFlight(book: BookWithRelations) {
  const status = book.readaloud?.status
  return status === "QUEUED" || status === "PROCESSING"
}

export async function exist(filepath: string) {
  try {
    await stat(filepath)
    return true
  } catch {
    return false
  }
}

/**
 * Removes the readaloud record unless it points to a finished, on-disk
 * readaloud file. Clearing the processed cache invalidates any partial run,
 * so an unfinished readaloud is dropped entirely and the book returns to its
 * unprocessed state (showing "Create readaloud" again) rather than being left
 * mid-stage with no backing cache.
 */
export async function resetReadaloudIfUnfinished(book: BookWithRelations) {
  const readaloud = book.readaloud
  if (!readaloud) return

  const exists = readaloud.filepath && (await exist(readaloud.filepath))
  const isFinished = readaloud.status === "ALIGNED" && exists

  if (isFinished) return

  await removeBookFormat(book.uuid, "readaloud")
}

export async function deleteTranscriptions(book: BookWithRelations) {
  const transcriptionsDir = getTranscriptionsFilepath(book)
  suppressPrefix(transcriptionsDir)
  await rm(getTranscriptionsFilepath(book), {
    recursive: true,
    force: true,
  })
  unsuppressPrefix(transcriptionsDir)
  await deleteEmissions(book)
}

export async function deleteEmissions(book: BookWithRelations) {
  const emissionsDir = getEmissionsFilepath(book)
  suppressPrefix(emissionsDir)
  await rm(emissionsDir, {
    recursive: true,
    force: true,
  })
  unsuppressPrefix(emissionsDir)
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
