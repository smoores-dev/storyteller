import { randomUUID } from "node:crypto"
import { tmpdir } from "node:os"

import {
  type Entry as YauzlEntry,
  type ZipFile as YauzlZipFile,
} from "yauzl-promise"

import { join, sep } from "@storyteller-platform/path"

import { openZip } from "../zip.ts"

import type { EpubStorageAdapter, EpubStorageKind } from "./interface.ts"

export interface MemoryAdapterOptions {
  /**
   * per-entry decompressed buffer cache
   * turn it off when opening many EPUBs and reading each entry at most once
   * keeps resident size bounded by the entry index, not the decompressed payload sum
   * @default true
   */
  cache?: boolean
  signal?: AbortSignal
}

/**
 * Loads an EPUB archive into memory and serves all I/O off the in-memory zip handle.
 *
 * read only
 *
 */
export class MemoryAdapter implements EpubStorageAdapter {
  static readonly kind = "in-memory" as const satisfies EpubStorageKind
  static readonly capabilities = { writable: false } as const

  static async init(
    source: string | Uint8Array,
    opts: MemoryAdapterOptions = {},
  ): Promise<MemoryAdapter> {
    const { cache = true, signal } = opts
    signal?.throwIfAborted()

    const zip = await openZip(source)

    const entries = new Map<string, YauzlEntry>()
    try {
      for await (const entry of zip) {
        signal?.throwIfAborted()
        if (entry.filename.endsWith("/")) continue
        entries.set(entry.filename, entry)
      }
    } catch (error) {
      await zip.close()
      throw error
    }

    // virtual root anchors absolute paths used by Epub's resolveInternalHref.
    // nothing is written to this path, it's a key prefix only.
    const rootPath = join(
      tmpdir(),
      `storyteller-platform-epub-zip-${randomUUID()}.epub`,
    )

    return new MemoryAdapter(rootPath, zip, entries, cache ? new Map() : null)
  }

  private constructor(
    public readonly rootPath: string,
    private zip: YauzlZipFile,
    private entries: Map<string, YauzlEntry>,
    private cache: Map<string, Buffer> | null,
  ) {}

  private toZipEntryKey(path: string): string {
    const prefix = this.rootPath.endsWith(sep)
      ? this.rootPath
      : this.rootPath + sep
    const rel = path.startsWith(prefix) ? path.slice(prefix.length) : path
    return sep === "/" ? rel : rel.split(sep).join("/")
  }

  async read(path: string): Promise<Uint8Array>
  async read(path: string, encoding: "utf-8"): Promise<string>
  async read(path: string, encoding?: "utf-8"): Promise<string | Uint8Array> {
    const key = this.toZipEntryKey(path)
    const cached = this.cache?.get(key)
    if (cached) {
      return encoding ? cached.toString(encoding) : new Uint8Array(cached)
    }

    const entry = this.entries.get(key)
    if (!entry) {
      const err = new Error(
        `ENOENT: zip entry not found in EPUB archive: ${key}`,
      )
      ;(err as Error & { code?: string }).code = "ENOENT"
      throw err
    }

    const stream = await entry.openReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer)
    }
    const buf = Buffer.concat(chunks)
    this.cache?.set(key, buf)
    return encoding ? buf.toString(encoding) : new Uint8Array(buf)
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async archiveLength(path: string): Promise<number> {
    const entry = this.entries.get(this.toZipEntryKey(path))
    if (!entry) return 0
    return entry.compressedSize || entry.uncompressedSize
  }

  dispose(): void {
    this.entries.clear()
    this.cache?.clear()
    // fire-and-forget: closing the handle just releases the fd
    this.zip.close().catch(() => undefined)
  }
}
