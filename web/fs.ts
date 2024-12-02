import { open } from "node:fs/promises"

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
      const chunkArray = new Uint8Array(chunk as ArrayBuffer)
      fileData.set(chunkArray, i)
      i += chunkArray.byteLength
    }
    return fileData
  } finally {
    await fileHandle.close()
  }
}
