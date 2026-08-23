import { createReadStream } from "node:fs"
import { type FileHandle, open as openFile } from "node:fs/promises"
import { type Readable } from "node:stream"

import {
  Reader,
  type ZipFile,
  fromBuffer,
  fromReader,
  open,
} from "yauzl-promise"

const EOCDR_SIGNATURE = Buffer.from([0x50, 0x4b, 0x05, 0x06])
const EOCDR_SIZE = 22
const MAX_TAIL_SCAN = 1024 * 1024

function toBuffer(source: Uint8Array): Buffer {
  return Buffer.isBuffer(source)
    ? source
    : Buffer.from(source.buffer, source.byteOffset, source.byteLength)
}

function findArchiveEnd(
  tail: Buffer,
  tailStart: number,
  fileSize: number,
): number | null {
  let searchFrom = tail.length - EOCDR_SIZE
  while (searchFrom >= 0) {
    const index = tail.lastIndexOf(EOCDR_SIGNATURE, searchFrom)
    if (index === -1) return null

    const commentLength = tail.readUInt16LE(index + 20)
    const end = tailStart + index + EOCDR_SIZE + commentLength
    if (end < fileSize) return end

    searchFrom = index - 1
  }
  return null
}

async function readExactly(
  handle: FileHandle,
  length: number,
  position: number,
): Promise<Buffer | null> {
  const buffer = Buffer.allocUnsafe(length)
  let offset = 0
  while (offset < length) {
    const { bytesRead } = await handle.read(
      buffer,
      offset,
      length - offset,
      position + offset,
    )
    if (bytesRead === 0) return null
    offset += bytesRead
  }
  return buffer
}

async function findFileArchiveEnd(path: string): Promise<number | null> {
  let handle: FileHandle
  try {
    handle = await openFile(path, "r")
  } catch {
    return null
  }

  try {
    const { size } = await handle.stat()
    const tailLength = Math.min(size, MAX_TAIL_SCAN)
    if (tailLength < EOCDR_SIZE) return null

    const tailStart = size - tailLength
    const tail = await readExactly(handle, tailLength, tailStart)
    if (!tail) return null

    return findArchiveEnd(tail, tailStart, size)
  } finally {
    await handle.close()
  }
}

/**
 * Basically sometimes EPUB 2s have some garbage at the end of the file after
 * the End of Central Directory Record, which leads to
 * `yauzl` throwing an "End of Central Directory Record not found" error
 *
 * This is an attempt to, when that error happens, try to read the file from the end and find the End of Central Directory Record, then clean up the garbage at the end of the file.
 */
class TruncatedFileReader extends Reader {
  private handle: FileHandle | null = null

  constructor(private readonly path: string) {
    super()
  }

  override async _open(): Promise<object> {
    this.handle = await openFile(this.path, "r")
    return {}
  }

  override async _close(): Promise<object> {
    const handle = this.handle
    this.handle = null
    if (handle) await handle.close()
    return {}
  }

  override async _read(start: number, length: number): Promise<Buffer> {
    if (!this.handle) throw new Error(`reader for ${this.path} is not open`)
    const buffer = await readExactly(this.handle, length, start)
    if (!buffer) {
      throw new Error(`unexpected end of file reading ${this.path}`)
    }
    return buffer
  }

  override _createReadStream(start: number, length: number): Readable {
    return createReadStream(this.path, { start, end: start + length - 1 })
  }
}

async function openBufferZip(data: Buffer): Promise<ZipFile> {
  try {
    return await fromBuffer(data)
  } catch (error) {
    const tailStart = Math.max(0, data.length - MAX_TAIL_SCAN)
    const end = findArchiveEnd(data.subarray(tailStart), tailStart, data.length)
    if (end === null) throw error
    try {
      return await fromBuffer(data.subarray(0, end))
    } catch {
      throw error
    }
  }
}

async function openFileZip(path: string): Promise<ZipFile> {
  try {
    return await open(path)
  } catch (error) {
    const end = await findFileArchiveEnd(path)
    if (end === null) throw error

    const reader = new TruncatedFileReader(path)
    try {
      return await fromReader(reader, end)
    } catch {
      await reader._close().catch(() => undefined)
      throw error
    }
  }
}

export async function openZip(source: string | Uint8Array): Promise<ZipFile> {
  return typeof source === "string"
    ? openFileZip(source)
    : openBufferZip(toBuffer(source))
}
