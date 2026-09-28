import { openZip } from "#zip"

import type {
  ArchiveSource,
  EpubStorageAdapter,
  EpubStorageKind,
  ZipArchive,
  ZipEntry,
} from "./interface.ts"

const utf8 = new TextDecoder("utf-8", { ignoreBOM: true })

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
    source: ArchiveSource,
    opts: MemoryAdapterOptions = {},
  ): Promise<MemoryAdapter> {
    const { cache = true, signal } = opts
    signal?.throwIfAborted()

    const zip = await openZip(source)
    if (signal?.aborted) {
      await zip.close()
      signal.throwIfAborted()
    }

    return new MemoryAdapter(
      zip,
      new Map(zip.entries.map((entry) => [entry.filename, entry])),
      cache ? new Map() : null,
    )
  }

  private constructor(
    private zip: ZipArchive,
    private entries: Map<string, ZipEntry>,
    private cache: Map<string, Uint8Array> | null,
  ) {}

  async read(entry: string): Promise<Uint8Array>
  async read(entry: string, encoding: "utf-8"): Promise<string>
  async read(entry: string, encoding?: "utf-8"): Promise<string | Uint8Array> {
    let data = this.cache?.get(entry)
    if (!data) {
      const zipEntry = this.entries.get(entry)
      if (!zipEntry) {
        const err = new Error(
          `ENOENT: zip entry not found in EPUB archive: ${entry}`,
        )
        ;(err as Error & { code?: string }).code = "ENOENT"
        throw err
      }
      data = await zipEntry.read()
      this.cache?.set(entry, data)
    }
    return encoding ? utf8.decode(data) : new Uint8Array(data)
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
