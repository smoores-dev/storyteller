import { readdir, stat } from "node:fs/promises"
import { join, relative } from "node:path"

import { xxh3 } from "@node-rs/xxhash"

import { isAudioFile } from "@/audio"

import { isInsideInternalDirectory } from "./internalDirs"

/**
 * truncate mtime to whole seconds. sub-second precision drifts
 * across Docker bind mounts, NFS, and CIFS, causing false "changed"
 * results without any actual file modification.
 */
function mtimeSec(mtimeMs: number): number {
  return Math.floor(mtimeMs / 1000)
}

/**
 * A file stat snapshot taken during fingerprinting
 */
export type StatEntry = {
  absPath: string
  relPath: string
  size: number
}

export type Fingerprint = {
  fingerprint: string
  fileSize: number | null
  /**
   * Single entry for files, sorted list for audiobook directories
   */
  entries: StatEntry[]
}

/**
 * stat-based fingerprint for a single file.
 * Format: `f:<size>:<mtimeSec>`
 */
export async function fingerprintFile(filepath: string): Promise<Fingerprint> {
  const s = await stat(filepath)
  const fileSize = s.isFile() ? s.size : null
  const mtime = mtimeSec(s.mtimeMs)

  return {
    fingerprint: `f:${fileSize ?? 0}:${mtime}`,
    fileSize,
    entries: s.isFile()
      ? [{ absPath: filepath, relPath: "", size: s.size }]
      : [],
  }
}

/**
 * stat-based fingerprint for an audiobook directory.
 * `relpath:size:mtimeSec` list. Format: `d:<count>:<totalSize>:<xxh3>`
 */
export async function fingerprintAudiobookDirectory(
  dirPath: string,
  signal?: AbortSignal,
): Promise<Fingerprint> {
  const dirEntries = await readdir(dirPath, {
    recursive: true,
    withFileTypes: true,
  })

  const filePaths = dirEntries
    .filter(
      (entry) =>
        entry.isFile() &&
        isAudioFile(entry.name) &&
        !isInsideInternalDirectory(join(entry.parentPath, entry.name)),
    )
    .map((entry) => join(entry.parentPath, entry.name))
    .sort()

  const hash = xxh3.Xxh3.withSeed()
  const entries: StatEntry[] = []
  let totalSize = 0

  for (const absPath of filePaths) {
    if (signal?.aborted) {
      const err = new Error("Operation aborted")
      err.name = "AbortError"
      throw err
    }

    const s = await stat(absPath)
    const relPath = relative(dirPath, absPath)
    totalSize += s.size
    entries.push({ absPath, relPath, size: s.size })

    hash.update(relPath)
    hash.update("\0")
    hash.update(String(s.size))
    hash.update("\0")
    hash.update(String(mtimeSec(s.mtimeMs)))
    hash.update("\n")
  }

  return {
    fingerprint: `d:${entries.length}:${totalSize}:${hash.digest().toString()}`,
    fileSize: totalSize,
    entries,
  }
}
