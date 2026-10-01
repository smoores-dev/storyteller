/**
 * Pluggable storage backend for an Epub instance
 *
 * Built-in adapters:
 *  - {@link TmpFsAdapter} extracts the archive to a tmp directory and
 *    supports the full read/write/save/upgrade
 *  - {@link MemoryAdapter} keeps an in-memory zip handle and supports
 *    reads only
 */
export type EpubStorageKind = "tmp-dir" | "in-memory" | (string & {})

export type ArchiveSource = string | Uint8Array | Blob

/**
 * A file in an opened zip archive. Directory entries are left out.
 */
export interface ZipEntry {
  readonly filename: string
  readonly compressedSize: number
  readonly uncompressedSize: number
  /** rejects when the data doesn't match the CRC32 or size in the central directory */
  read(): Promise<Uint8Array>
}

/**
 * An opened zip archive. The `#zip` import picks the reader:
 * yauzl-promise in Node, zip.js everywhere else.
 */
export interface ZipArchive {
  readonly entries: readonly ZipEntry[]
  close(): Promise<void>
}

export interface EpubStorageCapabilities {
  /** when false, the Epub class refuses every mutation method at runtime */
  readonly writable: boolean
}

export interface EpubListEntry {
  /** location the adapter can read the entry back from, in whatever form it stores */
  absolutePath: string
  /** the entry name, as it appears in the archive */
  relativePath: string
}

/**
 * Adapters only receive entry names, which is:
 * - the name a file has in the archive itself
 * - relative to the container root, slash-separated,
 * - already percent-decoded (eg `OEBPS/a b.xhtml`, not `OEBPS/a%20b.xhtml`)
 *
 * Adapter decides where to store files under what name
 * In previous versions of the EPUB lib, this was a little bit more muddled, leading to
 * eg the TmpFsAdapter trying to read `OEBPS/a%20b.xhtml`, whereas it was stored as `OEBPS/a b.xhtml`
 */
export interface EpubStorageAdapter {
  read(entry: string): Promise<Uint8Array>
  read(entry: string, encoding: "utf-8"): Promise<string>

  /**
   * Whether the archive holds an entry under exactly this name.
   * Used to choose between different canditates for an href
   * so should be exact
   */
  exists(entry: string): Promise<boolean>

  /**
   * Length of an entry in bytes, for the readium page-count heuristic
   * which expects compressed size when available
   */
  archiveLength(entry: string): Promise<number>

  /** Required for any mutation method on Epub */
  write?(entry: string, data: Uint8Array): Promise<void>
  write?(entry: string, data: string, encoding: "utf-8"): Promise<void>

  /** Required for removeManifestItem / setCoverImage replacement */
  remove?(entry: string): Promise<void>

  /** Required for Epub.saveAndClose to walk the contents */
  list?(): AsyncIterable<EpubListEntry>

  /** Required for Epub.copy */
  duplicate?(): Promise<EpubStorageAdapter>

  /** Required for Epub.saveAndClose */
  serialize?(targetPath: string): Promise<void>

  /** Always called on close or error */
  dispose(): void | Promise<void>
}

export interface EpubStorageAdapterClass<Opts extends object = object> {
  readonly kind: EpubStorageKind
  readonly capabilities: EpubStorageCapabilities

  /**
   * Open an archive from a path or buffer.
   * Will throw if the archive is not a valid EPUB 3
   */
  init(source: ArchiveSource, opts?: Opts): Promise<EpubStorageAdapter>

  /**
   * Initialize an empty extract root for {@link Epub.create}.
   * Only necessary for adapters that can write
   */
  initEmpty?(opts?: Opts): Promise<EpubStorageAdapter>
}

export type AdapterOptions<A> =
  A extends EpubStorageAdapterClass<infer Opts> ? Opts : object
