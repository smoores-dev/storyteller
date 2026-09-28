import { createReadStream } from "node:fs"
import { type FileHandle, open as openFile, stat } from "node:fs/promises"
import { Readable } from "node:stream"

import {
  type Entry,
  Reader,
  type ZipFile,
  fromBuffer,
  fromReader,
} from "yauzl-promise"

import type {
  ArchiveSource,
  ZipArchive,
  ZipEntry,
} from "./adapters/interface.ts"

export interface NodeZipEntry extends ZipEntry {
  openReadStream(): Promise<Readable>
}

export interface NodeZipArchive extends ZipArchive, AsyncDisposable {
  readonly entries: readonly NodeZipEntry[]
}

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

/**
 * Basically sometimes EPUB 2s have some garbage at the end of the file after
 * the End of Central Directory Record, which leads to
 * `yauzl` throwing an "End of Central Directory Record not found" error
 *
 * This is an attempt to, when that error happens, try to read the file from the end and find the End of Central Directory Record, then clean up the garbage at the end of the file.
 */
async function openTolerant(
  size: number,
  open: (size: number) => Promise<ZipFile>,
  readTail: (start: number) => Promise<Buffer | null>,
): Promise<ZipFile> {
  try {
    return await open(size)
  } catch (error) {
    const tailStart = Math.max(0, size - MAX_TAIL_SCAN)
    const tail = await readTail(tailStart).catch(() => null)
    const end = tail && findArchiveEnd(tail, tailStart, size)
    if (!end) throw error
    return await open(end).catch(() => {
      throw error
    })
  }
}

class FileHandleReader extends Reader implements AsyncDisposable {
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

  async [Symbol.asyncDispose](): Promise<void> {
    await this._close()
  }
}

// yauzl-promise's own `open(path)` leaves the file open when parsing fails,
// so we hand it a reader we close ourselves unless the zip takes it over
async function openFileZip(path: string, size: number): Promise<ZipFile> {
  await using cleanup = new AsyncDisposableStack()
  const reader = cleanup.use(new FileHandleReader(path))
  const zip = await fromReader(reader, size)
  cleanup.move()
  return zip
}

async function readFileTail(
  path: string,
  start: number,
): Promise<Buffer | null> {
  await using handle = await openFile(path, "r")
  const { size } = await handle.stat()
  return await readExactly(handle, size - start, start)
}

class BlobReader extends Reader {
  constructor(private readonly blob: Blob) {
    super()
  }

  override async _read(start: number, length: number): Promise<Buffer> {
    return Buffer.from(
      await this.blob.slice(start, start + length).arrayBuffer(),
    )
  }

  override _createReadStream(start: number, length: number): Readable {
    return Readable.fromWeb(this.blob.slice(start, start + length).stream())
  }
}

function toZipEntry(entry: Entry): NodeZipEntry {
  return {
    filename: entry.filename,
    compressedSize: entry.compressedSize,
    uncompressedSize: entry.uncompressedSize,
    openReadStream: () => entry.openReadStream(),
    async read() {
      const chunks: Buffer[] = []
      for await (const chunk of await entry.openReadStream()) {
        chunks.push(chunk as Buffer)
      }
      return Buffer.concat(chunks)
    },
  }
}

async function openYauzl(source: ArchiveSource): Promise<ZipFile> {
  if (typeof source === "string") {
    return await openTolerant(
      (await stat(source)).size,
      (size) => openFileZip(source, size),
      (start) => readFileTail(source, start),
    )
  }
  if (source instanceof Uint8Array) {
    const data = toBuffer(source)
    return await openTolerant(
      data.length,
      (size) => fromBuffer(data.subarray(0, size)),
      (start) => Promise.resolve(data.subarray(start)),
    )
  }
  return await openTolerant(
    source.size,
    (size) => fromReader(new BlobReader(source), size),
    async (start) => Buffer.from(await source.slice(start).arrayBuffer()),
  )
}

export async function openZip(source: ArchiveSource): Promise<NodeZipArchive> {
  await using cleanup = new AsyncDisposableStack()
  const zip = cleanup.adopt(await openYauzl(source), (zip) => zip.close())
  const entries = await zip.readEntries()
  const owned = cleanup.move()
  return {
    entries: entries
      .filter((entry) => !entry.filename.endsWith("/"))
      .map(toZipEntry),
    close: () => owned.disposeAsync(),
    [Symbol.asyncDispose]: () => owned.disposeAsync(),
  }
}
