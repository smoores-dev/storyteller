import { readFile } from "node:fs/promises"

import { type PortablePath } from "@yarnpkg/fslib"
import { ZipFS } from "@yarnpkg/libzip"
import { type AttachedImage } from "mediabunny"
import { lookup } from "mime-types"

import { basename, extname } from "@storyteller-platform/path"

import { BufferEntry } from "./bufferEntry.ts"
import { type AudiobookEntry, type Uint8ArrayEntry } from "./entry.ts"
import { FileEntry } from "./fileEntry.ts"
import { type AudiobookChapter, type AudiobookResource } from "./resources.ts"
import { ZipFSEntry } from "./zipFsEntry.ts"

export interface AudiobookMetadata {
  title?: string | null
  subtitle?: string | null
  description?: string | null
  coverArt?: AttachedImage | null
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

export type AudiobookInputs =
  | [`${string}.zip`]
  | [`${string}.audiobook`]
  | [
      `${string}${(typeof AUDIO_FILE_EXTENSIONS)[number]}`,
      ...`${string}${(typeof AUDIO_FILE_EXTENSIONS)[number]}`[],
    ]
  | [Uint8ArrayEntry, ...Uint8ArrayEntry[]]

export class Audiobook {
  protected metadata: AudiobookMetadata = {}
  private inputs: AudiobookInputs
  private entries: AudiobookEntry[]

  constructor(...inputs: AudiobookInputs) {
    this.inputs = inputs
    this.entries = this.getEntries()
  }

  private isZip() {
    const [first] = this.inputs
    return (
      typeof first === "string" &&
      (extname(first) === ".zip" || extname(first) === ".audiobook")
    )
  }

  private isFiles() {
    const [first] = this.inputs
    return typeof first === "string" && !this.isZip()
  }

  private isInMemory() {
    const [first] = this.inputs
    return typeof first !== "string"
  }

  private getEntries() {
    if (this.isZip()) {
      const [first] = this.inputs
      const zipFs = new ZipFS(first as PortablePath)
      const entries = zipFs.getAllFiles()
      return entries
        .filter((entry) =>
          AUDIO_FILE_EXTENSIONS.includes(
            extname(entry) as (typeof AUDIO_FILE_EXTENSIONS)[number],
          ),
        )
        .map((entry) => new ZipFSEntry(zipFs, entry))
    }
    if (this.isFiles()) {
      return this.inputs.map((input) => new FileEntry(input as PortablePath))
    }
    if (this.isInMemory()) {
      return this.inputs.map(
        (input) => new BufferEntry(input as Uint8ArrayEntry),
      )
    }
    return []
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

  async getCoverArt(): Promise<AttachedImage | null> {
    this.metadata.coverArt ??= await this.getFirstValue((entry) =>
      entry.getCoverArt(),
    )
    return this.metadata.coverArt
  }

  async setCoverArt(picture: AttachedImage): Promise<void> {
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

  async getArraysAndClose() {
    const output: Uint8ArrayEntry[] = []
    for (const entry of this.entries) {
      output.push(await entry.getArrayAndClose())
    }

    if (this.isZip()) {
      const zipFs = (this.entries[0] as ZipFSEntry).zipFs
      zipFs.discardAndClose()
    }

    return output
  }

  async saveAndClose() {
    if (this.isZip()) {
      for (const entry of this.entries) {
        await entry.saveAndClose()
      }

      const zipFs = (this.entries[0] as ZipFSEntry).zipFs
      zipFs.saveAndClose()
      return
    }

    if (this.isFiles()) {
      for (const entry of this.entries) {
        await entry.saveAndClose()
      }
    }

    if (this.isInMemory()) {
      throw new Error(
        `Cannot save in-memory Audiobooks. Use audiobook.getArraysAndClose() to access the updated array.`,
      )
    }
  }

  discardAndClose() {
    if (this.isZip()) {
      const zipFs = (this.entries[0] as ZipFSEntry).zipFs
      // @ts-expect-error internal property
      if (zipFs.ready) {
        zipFs.discardAndClose()
      }
    }

    this.inputs = [".mp3"]
    this.entries = []
  }

  [Symbol.dispose]() {
    this.discardAndClose()
  }
}

export async function getAttachedImageFromPath(
  path: string,
  kind: AttachedImage["kind"] = "coverFront",
  description?: string,
): Promise<AttachedImage> {
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
