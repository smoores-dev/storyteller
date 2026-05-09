import { createReadStream } from "node:fs"
import { readdir, stat } from "node:fs/promises"
import { join, relative } from "node:path"

import { xxh3 } from "@node-rs/xxhash"

import { type StatEntry } from "@/assets/library/fingerprint"
import { isAudioFile } from "@/audio"

function createAbortError(): Error {
  const error = new Error("Operation aborted")
  error.name = "AbortError"
  return error
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw createAbortError()
  }
}

/**
 * Stream the file through xxh3. If `knownSize` is provided (e.g. from a
 * prior fingerprint stat), the redundant stat call is skipped.
 */
export async function hashFile(
  filepath: string,
  signal?: AbortSignal,
  knownSize?: number | null,
): Promise<{ hash: string; fileSize: number | null }> {
  throwIfAborted(signal)

  const hash = xxh3.Xxh3.withSeed()
  let fileSize: number | null
  if (knownSize !== undefined) {
    fileSize = knownSize
  } else {
    const fileStats = await stat(filepath)
    fileSize = fileStats.isFile() ? fileStats.size : null
  }

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filepath)

    const onAbort = () => {
      stream.destroy(createAbortError())
    }

    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true })
    }

    const complete = () => {
      if (signal) {
        signal.removeEventListener("abort", onAbort)
      }
    }

    stream.on("data", (chunk: string | Buffer) => hash.update(chunk))
    stream.on("error", (error) => {
      complete()
      reject(error)
    })
    stream.on("end", () => {
      complete()
      resolve()
    })
  })

  return {
    hash: hash.digest().toString(),
    fileSize,
  }
}

/**
 * Hash an audiobook directory. If `knownEntries` is provided (e.g. from a
 * prior fingerprint walk), the readdir + per-file stat are skipped and we
 * go straight to streaming reads.
 */
export async function hashAudiobookDirectory(
  dirPath: string,
  signal?: AbortSignal,
  knownEntries?: StatEntry[],
): Promise<{ hash: string; fileSize: number | null }> {
  throwIfAborted(signal)

  const entries = knownEntries ?? (await walkAudiobookDirectory(dirPath))

  const hash = xxh3.Xxh3.withSeed()
  if (entries.length === 0) {
    hash.update("empty-audiobook-directory")
    return { hash: hash.digest().toString(), fileSize: 0 }
  }

  let totalSize = 0
  for (const entry of entries) {
    throwIfAborted(signal)
    totalSize += entry.size
    hash.update(entry.relPath)
    hash.update(":")
    const { hash: fileHash } = await hashFile(entry.absPath, signal, entry.size)
    hash.update(fileHash)
    hash.update(";")
  }

  return {
    hash: hash.digest().toString(),
    fileSize: totalSize,
  }
}

async function walkAudiobookDirectory(dirPath: string): Promise<StatEntry[]> {
  const dirEntries = await readdir(dirPath, {
    recursive: true,
    withFileTypes: true,
  })
  const filePaths = dirEntries
    .filter((entry) => entry.isFile() && isAudioFile(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort((a, b) => a.localeCompare(b))

  const out: StatEntry[] = []
  for (const absPath of filePaths) {
    const s = await stat(absPath)
    out.push({ absPath, relPath: relative(dirPath, absPath), size: s.size })
  }
  return out
}
