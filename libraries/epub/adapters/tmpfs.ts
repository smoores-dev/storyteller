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
import { tmpdir } from "node:os"
import { pipeline } from "node:stream/promises"

import { fromBuffer, open } from "yauzl-promise"
import { ZipFile } from "yazl"

import { dirname, join, sep } from "@storyteller-platform/path"

import type { EpubListEntry, EpubStorageAdapter } from "./interface.ts"

const MP3_FILE_EXTENSIONS = [".mp3"] as const
const MPEG4_FILE_EXTENSIONS = [".mp4", ".m4a", ".m4b"] as const
const AAC_FILE_EXTENSIONS = [".aac"] as const
const OGG_FILE_EXTENSIONS = [".ogg", ".oga", ".mogg"] as const
const OPUS_FILE_EXTENSIONS = [".opus"] as const
const WAVE_FILE_EXTENSIONS = [".wav"] as const
const AIFF_FILE_EXTENSIONS = [".aiff"] as const
const FLAC_FILE_EXTENSIONS = [".flac"] as const
const ALAC_FILE_EXTENSIONS = [".alac"] as const
const WEBM_FILE_EXTENSIONS = [".weba"] as const

const AUDIO_FILE_EXTENSIONS = [
  ...MP3_FILE_EXTENSIONS,
  ...AAC_FILE_EXTENSIONS,
  ...MPEG4_FILE_EXTENSIONS,
  ...OPUS_FILE_EXTENSIONS,
  ...OGG_FILE_EXTENSIONS,
  ...WAVE_FILE_EXTENSIONS,
  ...AIFF_FILE_EXTENSIONS,
  ...FLAC_FILE_EXTENSIONS,
  ...ALAC_FILE_EXTENSIONS,
  ...WEBM_FILE_EXTENSIONS,
] as const

function isAudioFile(filenameOrExt: string): boolean {
  // Rips from older tools arrive with uppercase extensions (".MP3"); the
  // extension's casing says nothing about the contents.
  const lowered = filenameOrExt.toLowerCase()
  return AUDIO_FILE_EXTENSIONS.some((ext) => lowered.endsWith(ext))
}

function mintRootPath(): string {
  return join(tmpdir(), `storyteller-platform-epub-${randomUUID()}`)
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
      const zipfile =
        typeof source === "string"
          ? await open(source)
          : await fromBuffer(Buffer.from(source))

      await using stack = new AsyncDisposableStack()
      stack.defer(async () => {
        await zipfile.close()
      })

      for await (const entry of zipfile) {
        if (entry.filename.endsWith("/")) {
          // directory entries are skipped; parent dirs are created implicitly
          continue
        }

        const writePath = join(rootPath, entry.filename)
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

  private constructor(public readonly rootPath: string) {}

  async read(path: string): Promise<Uint8Array>
  async read(path: string, encoding: "utf-8"): Promise<string>
  async read(path: string, encoding?: "utf-8"): Promise<string | Uint8Array> {
    return await readFile(path, encoding)
  }

  async write(path: string, data: Uint8Array): Promise<void>
  async write(path: string, data: string, encoding: "utf-8"): Promise<void>
  async write(
    path: string,
    data: Uint8Array | string,
    encoding?: "utf-8",
  ): Promise<void> {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, data, encoding)
  }

  async remove(path: string): Promise<void> {
    await rm(path)
  }

  async archiveLength(path: string): Promise<number> {
    try {
      const st = await stat(path)
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
        relativePath: absolutePath.replace(`${this.rootPath}${sep}`, ""),
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
    const tmpArchivePath = join(
      tmpdir(),
      `storyteller-platform-epub-${randomUUID()}`,
    )

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

    zipfile.addBuffer(Buffer.from("application/epub+zip"), "mimetype", {
      compress: false,
    })

    for await (const entry of this.list()) {
      if (entry.relativePath === "mimetype") continue
      zipfile.addFile(entry.absolutePath, entry.relativePath, {
        compress: !isAudioFile(entry.absolutePath),
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
