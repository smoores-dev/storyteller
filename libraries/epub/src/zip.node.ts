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

const UTF8_FLAG = 0x800
const UNICODE_PATH_EXTRA_FIELD = 0x7075
// IBM Code Page 437 in byte order, as yauzl-promise decodes it (lib/utils.js)
const CP437 =
  "\u0000\u263a\u263b\u2665\u2666\u2663\u2660\u2022\u25d8\u25cb\u25d9\u2642" +
  "\u2640\u266a\u266b\u263c\u25ba\u25c4\u2195\u203c\u00b6\u00a7\u25ac\u21a8" +
  "\u2191\u2193\u2192\u2190\u221f\u2194\u25b2\u25bc !\"#$%&'()*+,-./012345678" +
  "9:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~" +
  "\u2302\u00c7\u00fc\u00e9\u00e2\u00e4\u00e0\u00e5\u00e7\u00ea\u00eb\u00e8" +
  "\u00ef\u00ee\u00ec\u00c4\u00c5\u00c9\u00e6\u00c6\u00f4\u00f6\u00f2\u00fb" +
  "\u00f9\u00ff\u00d6\u00dc\u00a2\u00a3\u00a5\u20a7\u0192\u00e1\u00ed\u00f3" +
  "\u00fa\u00f1\u00d1\u00aa\u00ba\u00bf\u2310\u00ac\u00bd\u00bc\u00a1\u00ab" +
  "\u00bb\u2591\u2592\u2593\u2502\u2524\u2561\u2562\u2556\u2555\u2563\u2551" +
  "\u2557\u255d\u255c\u255b\u2510\u2514\u2534\u252c\u251c\u2500\u253c\u255e" +
  "\u255f\u255a\u2554\u2569\u2566\u2560\u2550\u256c\u2567\u2568\u2564\u2565" +
  "\u2559\u2558\u2552\u2553\u256b\u256a\u2518\u250c\u2588\u2584\u258c\u2590" +
  "\u2580\u03b1\u00df\u0393\u03c0\u03a3\u03c3\u00b5\u03c4\u03a6\u0398\u03a9" +
  "\u03b4\u221e\u03c6\u03b5\u2229\u2261\u00b1\u2265\u2264\u2320\u2321\u00f7" +
  "\u2248\u00b0\u2219\u00b7\u221a\u207f\u00b2\u25a0\u00a0"

const CP437_BYTES = new Map(Array.from(CP437, (char, byte) => [char, byte]))
const strictUtf8 = new TextDecoder("utf-8", { fatal: true })

/**
 * yauzl decodes a filename without the UTF-8 flag as CP437, but many writers
 * store UTF-8 without setting it. Like zip.js in zip.browser.ts, read such a
 * name as UTF-8 when its bytes are valid UTF-8.
 */
function decodeFilename(entry: Entry): string {
  const name = entry.filename
  if (entry.generalPurposeBitFlag & UTF8_FLAG) return name
  if (entry.extraFields.some((field) => field.id === UNICODE_PATH_EXTRA_FIELD))
    return name
  // oxlint-disable-next-line no-control-regex
  if (/^[\x00-\x7f]*$/.test(name)) return name
  const bytes: number[] = []
  for (const char of name) {
    const byte = CP437_BYTES.get(char)
    if (byte === undefined) return name
    bytes.push(byte)
  }
  try {
    return strictUtf8.decode(Uint8Array.from(bytes))
  } catch {
    return name
  }
}

function toZipEntry(entry: Entry): NodeZipEntry {
  return {
    filename: decodeFilename(entry),
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
