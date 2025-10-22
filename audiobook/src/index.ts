import { randomUUID } from "node:crypto"
import { createWriteStream, rmSync } from "node:fs"
import { cp, mkdir, readFile, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import * as util from "node:util"

import { lookup } from "mime-types"
import yauzl from "yauzl"
import { ZipFile } from "yazl"

import { basename, dirname, extname, join } from "@storyteller-platform/path"

import { AudiobookEntry } from "./entry.ts"
import { type AttachedPic } from "./ffmpeg.ts"
import { type AudiobookChapter, type AudiobookResource } from "./resources.ts"

function promisify<Arg, Options, Return>(
  api: (
    arg: Arg,
    options: Options,
    callback: (err: Error | null, result: Return) => void,
  ) => void,
): (arg: Arg, options: Options) => Promise<Return> {
  return function (arg: Arg, options: Options) {
    return new Promise(function (resolve, reject) {
      api(arg, options, function (err, response) {
        if (err) {
          reject(err)
          return
        }
        resolve(response)
      })
    })
  }
}
const unzipFromPath = promisify(
  (
    arg: string,
    options: yauzl.Options,
    callback: (err: Error | null, zipfile: yauzl.ZipFile) => void,
  ) => {
    yauzl.open(arg, options, callback)
  },
)

export interface AudiobookMetadata {
  title?: string | null
  subtitle?: string | null
  description?: string | null
  coverArt?: AttachedPic | null
  chapters?: AudiobookChapter[] | null
  resources?: AudiobookResource[] | null
  authors?: string[] | null
  narrators?: string[] | null
  publisher?: string | null
  releaseDate?: Date | null
}

export const COVER_IMAGE_FILE_EXTENSIONS = [
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
] as const
export const MP3_FILE_EXTENSIONS = [".mp3"] as const
export const MPEG4_FILE_EXTENSIONS = [".mp4", ".m4a", ".m4b"] as const
export const AAC_FILE_EXTENSIONS = [".aac"] as const
export const OGG_FILE_EXTENSIONS = [".ogg", ".oga", ".mogg"] as const
export const OPUS_FILE_EXTENSIONS = [".opus"] as const
export const WAVE_FILE_EXTENSIONS = [".wav"] as const
export const AIFF_FILE_EXTENSIONS = [".aiff"] as const
export const FLAC_FILE_EXTENSIONS = [".flac"] as const
export const ALAC_FILE_EXTENSIONS = [".alac"] as const
export const WEBM_FILE_EXTENSIONS = [".weba"] as const

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

export type AudiobookInputs = [string, ...string[]]

export class Audiobook {
  protected metadata: AudiobookMetadata = {}
  private inputs: AudiobookInputs
  private entries: AudiobookEntry[] = []
  private extractPath: string | undefined = undefined
  private isZip: boolean

  private constructor(...inputs: AudiobookInputs) {
    this.inputs = inputs

    const [first] = this.inputs
    this.isZip =
      typeof first === "string" &&
      (extname(first) === ".zip" || extname(first) === ".audiobook")
  }

  static async from(...inputs: AudiobookInputs) {
    const audiobook = new Audiobook(...inputs)
    audiobook.entries = await audiobook.getEntries()
    return audiobook
  }

  private async getEntries() {
    if (this.isZip) {
      const [first] = this.inputs
      const extractPath = join(
        tmpdir(),
        `storyteller-platform-audiobook-${randomUUID()}`,
      )
      this.extractPath = extractPath
      await mkdir(this.extractPath, { recursive: true })
      const zipfile = await unzipFromPath(first, { lazyEntries: true })

      using stack = new DisposableStack()
      stack.defer(() => {
        zipfile.close()
      })

      const entries: string[] = []

      // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
      const { promise, resolve } = Promise.withResolvers<void>()
      zipfile.on("end", () => {
        resolve()
      })
      const openReadStream = util.promisify(
        zipfile.openReadStream.bind(zipfile),
      )
      zipfile.readEntry()
      zipfile.on("entry", async (entry: yauzl.Entry) => {
        if (entry.fileName.endsWith("/")) {
          // Directory file names end with '/'.
          // Note that entries for directories themselves are optional.
          // An entry's fileName implicitly requires its parent directories to exist.
          zipfile.readEntry()
        } else {
          // file entry
          entries.push(entry.fileName)
          const readStream = await openReadStream(entry)
          readStream.on("end", function () {
            zipfile.readEntry()
          })
          const writePath = join(extractPath, entry.fileName)
          await mkdir(dirname(writePath), { recursive: true })
          readStream.pipe(createWriteStream(writePath))
        }
      })
      await promise

      return entries
        .filter((entry) =>
          AUDIO_FILE_EXTENSIONS.includes(
            extname(entry) as (typeof AUDIO_FILE_EXTENSIONS)[number],
          ),
        )
        .map((entry) => new AudiobookEntry(join(extractPath, entry)))
    } else {
      return this.inputs.map((input) => new AudiobookEntry(input))
    }
  }

  protected async getFirstValue<T>(
    getter: (entry: AudiobookEntry) => Promise<T>,
  ): Promise<T | null> {
    for (const entry of this.entries) {
      const value = await getter(entry)
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (value) return value
    }

    return null
  }

  protected async setValue(
    setter: (entry: AudiobookEntry) => Promise<void>,
  ): Promise<void> {
    for (const entry of this.entries) {
      await setter(entry)
    }
  }

  async getTitle(): Promise<string | null> {
    this.metadata.title ??= await this.getFirstValue((entry) =>
      entry.getTitle(),
    )
    return this.metadata.title
  }

  async setTitle(title: string): Promise<void> {
    this.metadata.title = title

    await this.setValue((entry) => entry.setTitle(title))
  }

  async getSubtitle(): Promise<string | null> {
    this.metadata.subtitle ??= await this.getFirstValue((entry) =>
      entry.getSubtitle(),
    )
    return this.metadata.subtitle
  }

  async setSubtitle(subtitle: string): Promise<void> {
    this.metadata.subtitle = subtitle

    await this.setValue((entry) => entry.setSubtitle(subtitle))
  }

  async getDescription(): Promise<string | null> {
    this.metadata.description ??= await this.getFirstValue((entry) =>
      entry.getDescription(),
    )
    return this.metadata.description
  }

  async setDescription(description: string): Promise<void> {
    this.metadata.description = description

    await this.setValue((entry) => entry.setDescription(description))
  }

  async getAuthors(): Promise<string[]> {
    this.metadata.authors ??= await this.getFirstValue((entry) =>
      entry.getAuthors(),
    )
    return this.metadata.authors ?? []
  }

  async setAuthors(authors: string[]): Promise<void> {
    this.metadata.authors = authors

    await this.setValue((entry) => entry.setAuthors(authors))
  }

  async getNarrators(): Promise<string[]> {
    this.metadata.narrators ??= await this.getFirstValue((entry) =>
      entry.getNarrators(),
    )
    return this.metadata.narrators ?? []
  }

  async setNarrators(narrators: string[]): Promise<void> {
    this.metadata.narrators = narrators

    await this.setValue((entry) => entry.setNarrators(narrators))
  }

  async getCoverArt(): Promise<AttachedPic | null> {
    this.metadata.coverArt ??= await this.getFirstValue((entry) =>
      entry.getCoverArt(),
    )
    return this.metadata.coverArt
  }

  async setCoverArt(picture: AttachedPic): Promise<void> {
    this.metadata.coverArt = picture

    await this.setValue((entry) => entry.setCoverArt(picture))
  }

  async getPublisher(): Promise<string | null> {
    this.metadata.publisher ??= await this.getFirstValue((entry) =>
      entry.getPublisher(),
    )
    return this.metadata.publisher
  }

  async setPublisher(publisher: string): Promise<void> {
    this.metadata.publisher = publisher

    await this.setValue((entry) => entry.setPublisher(publisher))
  }

  async getReleaseDate(): Promise<Date | null> {
    this.metadata.releaseDate ??= await this.getFirstValue((entry) =>
      entry.getReleaseDate(),
    )
    return this.metadata.releaseDate
  }

  async setReleaseDate(date: Date): Promise<void> {
    this.metadata.releaseDate = date

    await this.setValue((entry) => entry.setReleaseDate(date))
  }

  async getDuration(): Promise<number> {
    let duration = 0
    for (const entry of this.entries) {
      duration += await entry.getDuration()
    }
    return duration
  }

  async getChapters(): Promise<AudiobookChapter[]> {
    if (this.metadata.chapters) return this.metadata.chapters

    const chapters: AudiobookChapter[] = []
    for (const entry of this.entries) {
      const entryChapters = await entry.getChapters()
      if (entryChapters.length) {
        chapters.push(...entryChapters)
      } else {
        chapters.push({
          filename: entry.filename,
          start: 0,
          title:
            (await entry.getTrackTitle()) ??
            basename(entry.filename, extname(entry.filename)),
        })
      }
    }

    this.metadata.chapters = chapters

    return chapters
  }

  async setChapters(chapters: AudiobookChapter[]): Promise<void> {
    if (this.entries.length > 1) {
      throw new Error("Unable to set chapters for multi-file audiobook")
    }

    this.metadata.chapters = chapters
    await this.setValue((entry) => entry.setChapters(chapters))
  }

  async getResources(): Promise<AudiobookResource[]> {
    if (this.metadata.resources) return this.metadata.resources

    const resources: AudiobookResource[] = []
    for (let i = 0; i < this.entries.length; i++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const entry = this.entries[i]!
      const resource = await entry.getResource()
      if (!resource.title) {
        resource.title = `Track ${i + 1}`
      }
      resources.push(resource)
    }

    this.metadata.resources = resources

    return resources
  }

  async saveAndClose() {
    for (const entry of this.entries) {
      await entry.saveAndClose()
    }

    if (this.isZip && this.extractPath) {
      const tmpArchivePath = join(
        tmpdir(),
        `storyteller-platform-epub-${randomUUID()}`,
      )

      const [first] = this.inputs
      // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
      const { promise, resolve } = Promise.withResolvers<void>()
      const zipfile = new ZipFile()
      const writeStream = createWriteStream(tmpArchivePath)
      writeStream.on("close", () => {
        resolve()
      })
      await using stack = new AsyncDisposableStack()
      stack.defer(async () => {
        writeStream.close()
        await rm(tmpArchivePath, { force: true })
      })

      zipfile.outputStream.pipe(writeStream)

      const entries = await readdir(this.extractPath, {
        recursive: true,
        withFileTypes: true,
      })

      for (const entry of entries) {
        if (entry.isDirectory()) continue

        zipfile.addFile(
          join(entry.parentPath, entry.name),
          join(entry.parentPath, entry.name).replace(
            `${this.extractPath}/`,
            "",
          ),
        )
      }
      zipfile.end()
      await promise

      await cp(tmpArchivePath, first)
      return
    }
  }

  discardAndClose() {
    this.inputs = [""]
    this.entries = []

    if (this.extractPath) {
      rmSync(this.extractPath, { recursive: true })
    }
  }

  [Symbol.dispose]() {
    this.discardAndClose()
  }
}

export async function getAttachedImageFromPath(
  path: string,
  kind: AttachedPic["kind"] = "coverFront",
  description?: string,
): Promise<AttachedPic> {
  const data = await readFile(path)
  const name = basename(path)
  const mimeType = lookup(path) || ""
  return {
    data: new Uint8Array(data),
    name,
    kind,
    ...(description && { description }),
    mimeType,
  }
}
