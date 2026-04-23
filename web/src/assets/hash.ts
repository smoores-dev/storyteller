import { createReadStream } from "node:fs"
import { readdir, stat } from "node:fs/promises"
import { join, relative } from "node:path"

import { xxh3 } from "@node-rs/xxhash"

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

export async function hashFile(
  filepath: string,
  signal?: AbortSignal,
): Promise<{ hash: string; fileSize: number | null }> {
  throwIfAborted(signal)

  const hash = xxh3.Xxh3.withSeed()
  const fileStats = await stat(filepath)
  const fileSize = fileStats.isFile() ? fileStats.size : null

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

export async function hashAudiobookDirectory(
  dirPath: string,
  signal?: AbortSignal,
): Promise<{ hash: string; fileSize: number | null }> {
  throwIfAborted(signal)

  const entries = await readdir(dirPath, {
    recursive: true,
    withFileTypes: true,
  })
  const files = entries
    .filter((entry) => entry.isFile() && isAudioFile(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort((a, b) => a.localeCompare(b))

  const hash = xxh3.Xxh3.withSeed()
  if (files.length === 0) {
    hash.update("empty-audiobook-directory")
    return {
      hash: hash.digest().toString(),
      fileSize: 0,
    }
  }

  let totalSize = 0
  for (const file of files) {
    throwIfAborted(signal)

    const fileStats = await stat(file)
    totalSize += fileStats.size
    hash.update(relative(dirPath, file))
    hash.update(":")
    const { hash: fileHash } = await hashFile(file, signal)
    hash.update(fileHash)
    hash.update(";")
  }

  return {
    hash: hash.digest().toString(),
    fileSize: totalSize,
  }
}
