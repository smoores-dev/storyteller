import { randomUUID } from "node:crypto"
import { createWriteStream, rmSync } from "node:fs"
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import { pipeline } from "node:stream/promises"

import { ZipFile } from "yazl"

import { scratchPath } from "@storyteller-platform/fs"
import { type Kind, MediaType } from "@storyteller-platform/media-types"
import { dirname, join, sep } from "@storyteller-platform/path"

import { openZip } from "../zip.ts"

import type { EpubListEntry, EpubStorageAdapter } from "./interface.ts"

const PRECOMPRESSED_KINDS = new Set<Kind | undefined>([
  "audio",
  "image",
  "archive",
  "package",
])

function mintRootPath(): string {
  return scratchPath(`storyteller-platform-epub-${randomUUID()}`)
}

/**
 * Whether an entry name can be laid down inside the extract root.
 *
 * A `.` or `..` segment cannot name a real file, and joining one onto the
 * root would walk out of it, so such an entry is unreachable here whether it
 * came from a hostile archive or from an href that spelled it `%2E%2E`.
 */
function isStorableEntryName(entry: string): boolean {
  return !entry
    .split("/")
    .some((segment) => segment === "" || segment === "." || segment === "..")
}

/**
 * Extracts an EPUB archive to a temp directory and serves all I/O off
 * the real filesystem.
 * `Epub.using(TmpFsAdapter).from(...)` returns a writable {@link Epub}.
 */
export class TmpFsAdapter implements EpubStorageAdapter {
  static readonly kind = "extracted-dir" as const
  static readonly capabilities = { writable: true } as const

  static async init(source: string | Uint8Array): Promise<TmpFsAdapter> {
    const rootPath = mintRootPath()
    try {
      const zipfile = await openZip(source)

      await using stack = new AsyncDisposableStack()
      stack.defer(async () => {
        await zipfile.close()
      })

      for await (const entry of zipfile) {
        if (entry.filename.endsWith("/")) {
          // directory entries are skipped; parent dirs are created implicitly
          continue
        }
        if (!isStorableEntryName(entry.filename)) continue

        const writePath = join(rootPath, ...entry.filename.split("/"))
        const readStream = await entry.openReadStream()
        await mkdir(dirname(writePath), { recursive: true })
        const writeStream = createWriteStream(writePath)
        await pipeline(readStream, writeStream)
      }
    } catch (error) {
      rmSync(rootPath, { force: true, recursive: true })
      throw error
    }

    return new TmpFsAdapter(rootPath)
  }

  static async initEmpty(): Promise<TmpFsAdapter> {
    const rootPath = mintRootPath()
    await mkdir(rootPath, { recursive: true })
    return new TmpFsAdapter(rootPath)
  }

  private constructor(private readonly rootPath: string) {}

  private diskPath(entry: string): string {
    if (!isStorableEntryName(entry)) {
      const err = new Error(`ENOENT: no such entry in EPUB archive: ${entry}`)
      ;(err as Error & { code?: string }).code = "ENOENT"
      throw err
    }
    return join(this.rootPath, ...entry.split("/"))
  }

  async read(entry: string): Promise<Uint8Array>
  async read(entry: string, encoding: "utf-8"): Promise<string>
  async read(entry: string, encoding?: "utf-8"): Promise<string | Uint8Array> {
    return await readFile(this.diskPath(entry), encoding)
  }

  async write(entry: string, data: Uint8Array): Promise<void>
  async write(entry: string, data: string, encoding: "utf-8"): Promise<void>
  async write(
    entry: string,
    data: Uint8Array | string,
    encoding?: "utf-8",
  ): Promise<void> {
    const path = this.diskPath(entry)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, data, encoding)
  }

  async remove(entry: string): Promise<void> {
    await rm(this.diskPath(entry))
  }

  async exists(entry: string): Promise<boolean> {
    try {
      await stat(this.diskPath(entry))
      return true
    } catch {
      return false
    }
  }

  async archiveLength(entry: string): Promise<number> {
    try {
      const st = await stat(this.diskPath(entry))
      return st.size
    } catch {
      return 0
    }
  }

  async *list(): AsyncIterable<EpubListEntry> {
    const entries = await readdir(this.rootPath, {
      recursive: true,
      withFileTypes: true,
    })
    for (const entry of entries) {
      if (entry.isDirectory()) continue
      const absolutePath = join(entry.parentPath, entry.name)
      yield {
        absolutePath,
        relativePath: absolutePath
          .slice(this.rootPath.length + 1)
          .split(sep)
          .join("/"),
      }
    }
  }

  async duplicate(): Promise<TmpFsAdapter> {
    const newRoot = mintRootPath()
    try {
      await cp(this.rootPath, newRoot, { recursive: true })
    } catch (error) {
      rmSync(newRoot, { force: true, recursive: true })
      throw error
    }
    return new TmpFsAdapter(newRoot)
  }

  async serialize(targetPath: string): Promise<void> {
    const tmpArchivePath = mintRootPath()

    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
    const { promise, resolve, reject } = Promise.withResolvers<void>()
    const zipfile = new ZipFile()
    const writeStream = createWriteStream(tmpArchivePath)
    writeStream.on("close", () => {
      resolve()
    })
    writeStream.on("error", reject)
    zipfile.outputStream.on("error", reject)
    await using stack = new AsyncDisposableStack()
    stack.defer(async () => {
      writeStream.close()
      await rm(tmpArchivePath, { force: true })
    })

    zipfile.outputStream.pipe(writeStream)

    zipfile.addBuffer(Buffer.from(MediaType.EPUB.mime), "mimetype", {
      compress: false,
    })

    for await (const entry of this.list()) {
      if (entry.relativePath === "mimetype") continue
      zipfile.addFile(entry.absolutePath, entry.relativePath, {
        compress: !PRECOMPRESSED_KINDS.has(
          MediaType.fromPath(entry.absolutePath)?.kind,
        ),
      })
    }

    zipfile.end()
    await promise

    await cp(tmpArchivePath, targetPath)
  }

  dispose(): void {
    rmSync(this.rootPath, { recursive: true, force: true })
  }
}
