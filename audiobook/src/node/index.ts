import { basename, extname } from "@smoores/path"
import { AudiobookEntry } from "./entry.js"
import { streamFile } from "@smoores/fs"
import {
  ERR_DUPLICATED_NAME,
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ZipReader,
  ZipWriter,
} from "@zip.js/zip.js"
import { BaseAudiobook } from "../base.js"
import { type Uint8ArrayEntry } from "../entry.js"
import { writeFile } from "node:fs/promises"
import { type IPicture, Picture } from "node-taglib-sharp"

export class Audiobook extends BaseAudiobook {
  protected constructor(
    protected override entries: AudiobookEntry[],
    protected zipPath?: string,
  ) {
    super()
  }

  static async from(
    pathOrPathsOrData: string | string[] | Uint8ArrayEntry | Uint8ArrayEntry[],
  ): Promise<Audiobook> {
    if (Array.isArray(pathOrPathsOrData)) {
      return new Audiobook(
        pathOrPathsOrData.map((path) => new AudiobookEntry(path)),
      )
    }

    const filepath =
      typeof pathOrPathsOrData === "string"
        ? pathOrPathsOrData
        : pathOrPathsOrData.filename
    const ext = extname(filepath)
    if (ext === ".zip") {
      const dataReader = new Uint8ArrayReader(
        typeof pathOrPathsOrData === "string"
          ? await streamFile(pathOrPathsOrData)
          : pathOrPathsOrData.data,
      )
      const zipReader = new ZipReader(dataReader)
      const zipEntries = await zipReader.getEntries()
      const entries = zipEntries.map((entry) => new AudiobookEntry(entry))
      return new Audiobook(entries, filepath)
    }

    return new Audiobook([new AudiobookEntry(pathOrPathsOrData)])
  }

  async save(): Promise<Uint8ArrayEntry[] | undefined> {
    const result: Uint8ArrayEntry[] = []
    for (const entry of this.entries) {
      entry.save()
      if (!entry.persisted()) {
        result.push({ filename: entry.filename, data: await entry.getData() })
      }
    }

    if (this.zipPath) {
      const dataWriter = new Uint8ArrayWriter()
      const zipWriter = new ZipWriter(dataWriter)

      await Promise.all(
        this.entries.map(async (entry) => {
          const data = await entry.getData()
          const reader = new Uint8ArrayReader(data)
          try {
            return zipWriter.add(entry.filename, reader)
          } catch (e) {
            if (e instanceof Error && e.message === ERR_DUPLICATED_NAME) {
              throw new Error(
                `Failed to add file "${entry.filename}" to zip archive: ${e.message}`,
              )
            }
            throw e
          }
        }),
      )
      const data = await zipWriter.close()
      await writeFile(this.zipPath, data)
      return
    }

    if (result.length) return result
    return undefined
  }

  override async setCoverArt(picture: string | IPicture): Promise<void> {
    if (typeof picture === "string") {
      const filename = basename(picture)
      picture = Picture.fromPath(picture)
      picture.filename = filename
    }
    return super.setCoverArt(picture)
  }

  close(): void {
    for (const entry of this.entries) {
      entry.close()
    }
  }
}
