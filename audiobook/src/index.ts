import { randomUUID } from "node:crypto"
import { createReadStream, createWriteStream } from "node:fs"
import { mkdir, readFile, readdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { pipeline } from "node:stream/promises"

import { PortablePath, ppath } from "@yarnpkg/fslib"
import { ZipFS } from "@yarnpkg/libzip"
import { lookup } from "mime-types"

import { basename, dirname, extname, join } from "@storyteller-platform/path"

import { AudiobookEntry } from "./entry.ts"
import { type AttachedPic } from "./ffmpeg.ts"
import { type AudiobookChapter, type AudiobookResource } from "./resources.ts"

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
  private tmpDir: string | undefined = undefined
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
      const tmpDir = join(
        tmpdir(),
        `storyteller-platform-audiobook-${randomUUID()}`,
      )
      this.tmpDir = tmpDir
      await mkdir(this.tmpDir, { recursive: true })
      const zipFs = new ZipFS(first as PortablePath)
      const entries = zipFs.getAllFiles()
      for (const entry of entries) {
        await mkdir(join(this.tmpDir, dirname(entry)), { recursive: true })
        await pipeline(
          zipFs.createReadStream(entry),
          createWriteStream(join(this.tmpDir, entry)),
        )
      }
      zipFs.discardAndClose()
      return entries
        .filter((entry) =>
          AUDIO_FILE_EXTENSIONS.includes(
            extname(entry) as (typeof AUDIO_FILE_EXTENSIONS)[number],
          ),
        )
        .map((entry) => new AudiobookEntry(join(tmpDir, entry)))
    } else {
      return this.inputs.map(
        (input) => new AudiobookEntry(input as PortablePath),
      )
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

    if (this.isZip) {
      const [first] = this.inputs
      const zipFs = new ZipFS(first as PortablePath)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const tmpDir = this.tmpDir!
      const entries = await readdir(tmpDir, { recursive: true })
      for (const entry of entries) {
        await zipFs.mkdirPromise(
          ppath.join(PortablePath.root, dirname(entry) as PortablePath),
          { recursive: true },
        )
        await pipeline(
          createReadStream(join(tmpDir, entry)),
          zipFs.createWriteStream(
            ppath.join(PortablePath.root, entry as PortablePath),
          ),
        )
      }

      zipFs.saveAndClose()
      return
    }
  }

  discardAndClose() {
    this.inputs = [""]
    this.entries = []
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
