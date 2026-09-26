import { type Dirent } from "node:fs"
import { lstat, readdir, rm, unlink, writeFile } from "node:fs/promises"
import { isAbsolute, join, relative, resolve, sep } from "node:path"

import {
  releasePrefixAfterSettle,
  suppressPrefix,
} from "@/assets/library/scanner/write-intent"
import { getInternalBookDirectory } from "@/assets/paths"
import { db } from "@/database/connection"
import { getUnreferencedImages } from "@/database/images"
import { getSettings } from "@/database/settings"
import {
  ASSETS_DIR,
  BACKUP_DIR,
  CACHE_DIR,
  DATA_DIR,
  DB_DIR,
  IMAGES_DIR,
  IMAGE_CACHE_DIR,
  LOG_DIR,
  SCRATCH_DIR,
  SNAPSHOT_DIR,
  UPLOADS_DIR,
} from "@/directories"
import { sweepUnreferencedImages } from "@/images/gc"
import { listLogFiles, todayDateString } from "@/logFiles"

const RECENT_MS = 60 * 60 * 1000
const STALE_UPLOAD_MS = 24 * 60 * 60 * 1000

const BOOK_FOLDER_LAYOUT = new Set([
  "text",
  "audio",
  "aligned",
  "transcoded audio",
  "transcriptions",
  "emissions",
  ".storyteller",
  "ebook cover",
  "audiobook cover",
  ".DS_Store",
])

const BOOK_FILE_FOLDERS = new Set(["text", "audio", "aligned"])

export type StorageUsage = { bytes: number; count: number }

export type OrphanFolder = {
  name: string
  bytes: number
  hasBookFiles: boolean
}

async function listEntries(directory: string) {
  return await readdir(directory, { withFileTypes: true }).catch(
    (error: unknown): Dirent[] => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
      throw error
    },
  )
}

async function inspectTree(path: string) {
  const root = await lstat(path).catch(() => null)
  if (!root) return null

  const entries = root.isDirectory()
    ? await readdir(path, { withFileTypes: true, recursive: true }).catch(
        () => null,
      )
    : []
  if (!entries) return null

  const seen = new Set<number>()
  let bytes = root.isFile() ? root.size : 0
  let newestMtimeMs = root.mtimeMs
  let hasBookFiles = false

  for (const entry of entries) {
    const entryPath = join(entry.parentPath, entry.name)
    const info = await lstat(entryPath).catch(() => null)
    if (!info) continue

    newestMtimeMs = Math.max(newestMtimeMs, info.mtimeMs)
    if (!info.isFile() || seen.has(info.ino)) continue

    seen.add(info.ino)
    bytes += info.size
    const topFolder = relative(path, entryPath).split(sep)[0] ?? ""
    if (BOOK_FILE_FOLDERS.has(topFolder)) hasBookFiles = true
  }

  return { bytes, newestMtimeMs, hasBookFiles }
}

function pathKey(path: string) {
  return resolve(path).normalize("NFC").toLowerCase()
}

function contains(folder: string, path: string) {
  const folderKey = pathKey(folder)
  const key = pathKey(path)
  return key === folderKey || key.startsWith(folderKey + sep)
}

async function getClaims() {
  const [books, formats, rules, settings] = await Promise.all([
    db.selectFrom("book").selectAll().execute(),
    db
      .selectFrom("readaloud")
      .select("filepath")
      .unionAll(db.selectFrom("ebook").select("filepath"))
      .unionAll(db.selectFrom("audiobook").select("filepath"))
      .execute(),
    db.selectFrom("importRule").select("path").execute(),
    getSettings(),
  ])

  const bookFolders = new Set(
    books.map((book) => pathKey(getInternalBookDirectory(book))),
  )
  const contained = [
    ...formats.flatMap(({ filepath }) => {
      if (!filepath) return []
      return isAbsolute(filepath)
        ? [filepath]
        : [resolve(filepath), resolve(DATA_DIR, filepath)]
    }),
    DATA_DIR,
    DB_DIR,
    SNAPSHOT_DIR,
    SCRATCH_DIR,
    UPLOADS_DIR,
    IMAGES_DIR,
    IMAGE_CACHE_DIR,
    CACHE_DIR,
    BACKUP_DIR,
    LOG_DIR,
  ]
  const overlapping = [
    ...rules.map(({ path }) => path),
    ...(settings.readaloudLocationType === "CUSTOM_FOLDER"
      ? [settings.readaloudLocation]
      : []),
  ]

  return (folder: string) =>
    bookFolders.has(pathKey(folder)) ||
    contained.some((path) => contains(folder, path)) ||
    overlapping.some((path) => contains(folder, path) || contains(path, folder))
}

async function removeEntry(path: string) {
  suppressPrefix(path)
  try {
    await rm(path, { recursive: true, force: true })
  } finally {
    releasePrefixAfterSettle(path)
  }
}

async function inspectOrphan(
  name: string,
  isClaimed: (folder: string) => boolean,
): Promise<OrphanFolder | null> {
  const path = join(ASSETS_DIR, name)
  if (name.startsWith(".") || isClaimed(path)) return null

  const children = await readdir(path).catch(() => null)
  if (!children?.every((child) => BOOK_FOLDER_LAYOUT.has(child))) return null

  const tree = await inspectTree(path)
  if (!tree || tree.newestMtimeMs > Date.now() - RECENT_MS) return null

  return { name, bytes: tree.bytes, hasBookFiles: tree.hasBookFiles }
}

export async function findOrphanFolders() {
  const [isClaimed, entries] = await Promise.all([
    getClaims(),
    listEntries(ASSETS_DIR),
  ])

  const orphans: OrphanFolder[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const orphan = await inspectOrphan(entry.name, isClaimed)
    if (orphan) orphans.push(orphan)
  }
  return orphans
}

export async function deleteOrphanFolders(names: string[]) {
  let deleted = 0
  for (const name of new Set(names)) {
    const orphan = await inspectOrphan(name, await getClaims())
    if (!orphan) continue

    await removeEntry(join(ASSETS_DIR, name))
    deleted++
  }
  return deleted
}

export async function measureUnusedImages(): Promise<StorageUsage> {
  const unreferenced = await getUnreferencedImages()
  if (unreferenced.length === 0) return { bytes: 0, count: 0 }

  const rows = await db
    .selectFrom("image")
    .select("byteSize")
    .where(
      "uuid",
      "in",
      unreferenced.map(({ uuid }) => uuid),
    )
    .execute()
  return {
    bytes: rows.reduce((total, row) => total + row.byteSize, 0),
    count: rows.length,
  }
}

export async function deleteUnusedImages() {
  return await sweepUnreferencedImages()
}

async function measureEntries(paths: string[]): Promise<StorageUsage> {
  const trees = await Promise.all(paths.map(inspectTree))
  return {
    bytes: trees.reduce((total, tree) => total + (tree?.bytes ?? 0), 0),
    count: paths.length,
  }
}

export async function measureImageCache(): Promise<StorageUsage> {
  const tree = await inspectTree(IMAGE_CACHE_DIR)
  const files = await readdir(IMAGE_CACHE_DIR, {
    withFileTypes: true,
    recursive: true,
  }).catch(() => [])
  return {
    bytes: tree?.bytes ?? 0,
    count: files.filter((entry) => entry.isFile()).length,
  }
}

export async function clearImageCache() {
  for (const entry of await listEntries(IMAGE_CACHE_DIR)) {
    await rm(join(IMAGE_CACHE_DIR, entry.name), {
      recursive: true,
      force: true,
    })
  }
}

async function findStaleUploads() {
  const [isClaimed, entries] = await Promise.all([
    getClaims(),
    listEntries(UPLOADS_DIR),
  ])

  const uploads = new Map<string, string[]>()
  for (const entry of entries) {
    const id = entry.name.replace(/\.json$/, "")
    uploads.set(id, [...(uploads.get(id) ?? []), join(UPLOADS_DIR, entry.name)])
  }

  const cutoff = Date.now() - STALE_UPLOAD_MS
  const stale: string[][] = []
  for (const paths of uploads.values()) {
    if (paths.some((path) => isClaimed(path))) continue

    const trees = await Promise.all(paths.map(inspectTree))
    if (trees.every((tree) => tree && tree.newestMtimeMs < cutoff)) {
      stale.push(paths)
    }
  }
  return stale
}

export async function measureStaleUploads(): Promise<StorageUsage> {
  const stale = await findStaleUploads()
  const usage = await measureEntries(stale.flat())
  return { bytes: usage.bytes, count: stale.length }
}

export async function clearStaleUploads() {
  for (const path of (await findStaleUploads()).flat()) {
    await removeEntry(path)
  }
}

export async function measureLogs(): Promise<StorageUsage> {
  const files = await listLogFiles()
  return {
    bytes: files.reduce((total, file) => total + file.size, 0),
    count: files.length,
  }
}

export async function clearLogs() {
  const today = todayDateString()

  for (const file of await listLogFiles()) {
    if (file.date === today) await writeFile(file.path, "")
    else await unlink(file.path).catch(() => undefined)
  }
}
