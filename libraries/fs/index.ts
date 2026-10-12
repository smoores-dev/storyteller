import { open } from "node:fs/promises"
import { tmpdir } from "node:os"
import { sep, resolve } from "node:path"

/**
 * Like readFile, but streams the file into memory in chunks
 * to avoid hard-coded 2GB limit on file I/O operations in
 * Node.js/libuv https://github.com/libuv/libuv/pull/1501
 */
export async function streamFile(path: string): Promise<Uint8Array> {
  const fileHandle = await open(path)
  try {
    const stats = await fileHandle.stat()
    const fileData = new Uint8Array(stats.size)
    let i = 0
    for await (const chunk of fileHandle.createReadStream()) {
      const buffer = chunk as Buffer
      fileData.set(buffer, i)
      i += buffer.byteLength
    }
    return fileData
  } finally {
    await fileHandle.close()
  }
}

/**
 * Streams a file in chunks using an async generator,
 * avoiding the 2GB limit referenced above.
 */
export async function* getFileChunks(path: string): AsyncGenerator<Buffer> {
  const fileHandle = await open(path)
  try {
    for await (const chunk of fileHandle.createReadStream()) {
      yield chunk as Buffer
    }
  } finally {
    await fileHandle.close()
  }
}

export function scratchPath(...segments: string[]): string {
  return resolve(
    // oxlint-disable-next-line storyteller/no-tmpdir
    process.env["STORYTELLER_SCRATCH_DIR"] || tmpdir(),
    ...segments,
  )
}

/**
 * Detect whether a file is meant to be "hidden", per OS-specific
 * file naming conventions.
 *
 * Returns true for files whose basename begins with a dot (e.g. `.env`)
 * or whose paths contain the segment `@eaDir` (e.g. `@eaDir/file.mp3`),
 * which is Synology's "metadata" directory name.
 */
export function isHiddenFile(nameOrPath: string): boolean {
  const segments = nameOrPath.split(sep)
  for (const segment of segments) {
    // Synology "hidden" file metadata directory
    if (segment === "@eaDir") return true

    if (segment.startsWith(".")) return true
  }

  return false
}
