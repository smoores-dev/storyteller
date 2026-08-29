import {
  type Entry as YauzlEntry,
  type ZipFile as YauzlZipFile,
} from "yauzl-promise"

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

    return new MemoryAdapter(zip, entries, cache ? new Map() : null)
  }

  private constructor(
    private zip: YauzlZipFile,
    private entries: Map<string, YauzlEntry>,
    private cache: Map<string, Buffer> | null,
  ) {}

  async read(entry: string): Promise<Uint8Array>
  async read(entry: string, encoding: "utf-8"): Promise<string>
  async read(entry: string, encoding?: "utf-8"): Promise<string | Uint8Array> {
    const cached = this.cache?.get(entry)
    if (cached) {
      return encoding ? cached.toString(encoding) : new Uint8Array(cached)
    }

    const zipEntry = this.entries.get(entry)
    if (!zipEntry) {
      const err = new Error(
        `ENOENT: zip entry not found in EPUB archive: ${entry}`,
      )
      ;(err as Error & { code?: string }).code = "ENOENT"
      throw err
    }

    const stream = await zipEntry.openReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer)
    }
    const buf = Buffer.concat(chunks)
    this.cache?.set(entry, buf)
    return encoding ? buf.toString(encoding) : new Uint8Array(buf)
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async exists(entry: string): Promise<boolean> {
    return this.entries.has(entry)
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async archiveLength(entry: string): Promise<number> {
    const zipEntry = this.entries.get(entry)
    if (!zipEntry) return 0
    return zipEntry.compressedSize || zipEntry.uncompressedSize
  }

  dispose(): void {
    this.entries.clear()
    this.cache?.clear()
    // fire-and-forget: closing the handle just releases the fd
    this.zip.close().catch(() => undefined)
  }
}
