import {
  type AttachedImage,
  BufferTarget,
  Conversion,
  FLAC,
  FlacOutputFormat,
  type Input,
  MP3,
  MP4,
  type MetadataTags,
  Mp3OutputFormat,
  Mp4OutputFormat,
  OGG,
  OggOutputFormat,
  Output,
  type OutputFormat,
  WAVE,
  WavOutputFormat,
} from "mediabunny"

import { type AudiobookChapter, type AudiobookResource } from "./resources.ts"
import { getWriteTags, readTagMap } from "./tagMaps.ts"

export interface Uint8ArrayEntry {
  filename: string
  data: Uint8Array
}

function splitNames(names: string): string[] {
  return names.split(/[;,/]/).map((name) => name.trim())
}

export abstract class AudiobookEntry {
  public abstract filename: string
  private metadataTags: MetadataTags | null = null
  private duration: number | null = null
  public abstract getChapters(): Promise<AudiobookChapter[]>

  abstract getInput(): Promise<Input> | Input
  abstract saveAndClose(): Promise<void>

  async getMetadataTags(): Promise<MetadataTags> {
    if (this.metadataTags) return this.metadataTags

    const input = await this.getInput()
    this.metadataTags = await input.getMetadataTags()
    return this.metadataTags
  }

  async getOutputFormat(): Promise<OutputFormat | null> {
    const input = await this.getInput()
    const inputFormat = await input.getFormat()
    switch (inputFormat) {
      case MP3: {
        return new Mp3OutputFormat()
      }
      case MP4: {
        return new Mp4OutputFormat()
      }
      case WAVE: {
        return new WavOutputFormat()
      }
      case OGG: {
        return new OggOutputFormat()
      }
      case FLAC: {
        return new FlacOutputFormat()
      }
    }
    return null
  }

  async getTitle(): Promise<string | null> {
    const tags = await this.getMetadataTags()
    if (!tags.raw) return null
    for (const tag of readTagMap.title) {
      if (typeof tags.raw[tag] === "string") {
        return tags.raw[tag]
      }
    }
    return null
  }

  async getTrackTitle(): Promise<string | null> {
    const tags = await this.getMetadataTags()
    if (!tags.raw) return null
    for (const tag of readTagMap.trackTitle) {
      if (typeof tags.raw[tag] === "string") {
        return tags.raw[tag]
      }
    }
    return null
  }

  async setTitle(title: string): Promise<void> {
    const tags = await this.getMetadataTags()
    const input = await this.getInput()
    const inputFormat = await input.getFormat()

    const writeTags = getWriteTags(inputFormat, "title")

    tags.raw ??= {}
    for (const tag of writeTags) {
      tags.raw[tag] = title
    }
  }

  async getSubtitle(): Promise<string | null> {
    const tags = await this.getMetadataTags()
    if (!tags.raw) return null
    for (const subtitleTag of readTagMap.subtitle) {
      if (typeof tags.raw[subtitleTag] === "string") {
        return tags.raw[subtitleTag]
      }
    }
    return null
  }

  async setSubtitle(subtitle: string): Promise<void> {
    const tags = await this.getMetadataTags()
    const input = await this.getInput()
    const inputFormat = await input.getFormat()

    const writeTags = getWriteTags(inputFormat, "subtitle")

    tags.raw ??= {}
    for (const tag of writeTags) {
      tags.raw[tag] = subtitle
    }
  }

  async getDescription(): Promise<string | null> {
    const tags = await this.getMetadataTags()
    if (!tags.raw) return null
    for (const tag of readTagMap.description) {
      if (typeof tags.raw[tag] === "string") {
        return tags.raw[tag]
      }
    }
    return null
  }

  async setDescription(description: string): Promise<void> {
    const tags = await this.getMetadataTags()
    const input = await this.getInput()
    const inputFormat = await input.getFormat()

    const writeTags = getWriteTags(inputFormat, "description")

    tags.raw ??= {}
    for (const tag of writeTags) {
      tags.raw[tag] = description
    }
  }

  async getAuthors(): Promise<string[]> {
    const tags = await this.getMetadataTags()
    if (!tags.raw) return []
    for (const tag of readTagMap.authors) {
      if (typeof tags.raw[tag] === "string") {
        return splitNames(tags.raw[tag])
      }
    }
    return []
  }

  async setAuthors(authors: string[]): Promise<void> {
    const tags = await this.getMetadataTags()
    const input = await this.getInput()
    const inputFormat = await input.getFormat()

    const writeTags = getWriteTags(inputFormat, "authors")

    tags.raw ??= {}
    for (const tag of writeTags) {
      tags.raw[tag] = authors.join(";")
    }
  }

  async getNarrators(): Promise<string[]> {
    const tags = await this.getMetadataTags()
    if (!tags.raw) return []
    for (const tag of readTagMap.narrators) {
      if (typeof tags.raw[tag] === "string") {
        return splitNames(tags.raw[tag])
      }
    }
    return []
  }

  async setNarrators(narrators: string[]): Promise<void> {
    const tags = await this.getMetadataTags()
    const input = await this.getInput()
    const inputFormat = await input.getFormat()

    const writeTags = getWriteTags(inputFormat, "narrators")

    tags.raw ??= {}
    for (const tag of writeTags) {
      tags.raw[tag] = narrators.join(";")
    }
  }

  async getCoverArt(): Promise<AttachedImage | null> {
    const tags = await this.getMetadataTags()

    return tags.images?.find((image) => image.kind === "coverFront") ?? null
  }

  async setCoverArt(picture: AttachedImage): Promise<void> {
    const tags = await this.getMetadataTags()
    const images = tags.images ?? []
    const frontCover = images.find((image) => image.kind === "coverFront")
    if (frontCover) {
      Object.assign(frontCover, picture)
    } else {
      images.push(picture)
    }
    tags.images = images
  }

  async getPublisher(): Promise<string | null> {
    const tags = await this.getMetadataTags()
    if (!tags.raw) return null
    for (const tag of readTagMap.publisher) {
      if (typeof tags.raw[tag] === "string") {
        return tags.raw[tag]
      }
    }
    return null
  }

  async setPublisher(publisher: string): Promise<void> {
    const tags = await this.getMetadataTags()
    const input = await this.getInput()
    const inputFormat = await input.getFormat()

    const writeTags = getWriteTags(inputFormat, "publisher")

    tags.raw ??= {}
    for (const tag of writeTags) {
      tags.raw[tag] = publisher
    }
  }

  async getReleaseDate(): Promise<Date | null> {
    const tags = await this.getMetadataTags()
    if (!tags.raw) return null
    for (const tag of readTagMap.releaseDate) {
      if (typeof tags.raw[tag] === "string") {
        return new Date(tags.raw[tag])
      }
    }
    return null
  }

  async setReleaseDate(date: Date): Promise<void> {
    const tags = await this.getMetadataTags()
    const input = await this.getInput()
    const inputFormat = await input.getFormat()

    const writeTags = getWriteTags(inputFormat, "releaseDate")

    tags.raw ??= {}
    for (const tag of writeTags) {
      tags.raw[tag] =
        `${date.getDate().toString().padStart(2, "0")}-${date.getMonth().toString().padStart(2, "0")}-${date.getFullYear()}`
    }
  }

  async getDuration(): Promise<number> {
    const input = await this.getInput()
    this.duration ??= await input.computeDuration()
    return this.duration
  }

  async getResource(): Promise<AudiobookResource> {
    const input = await this.getInput()
    this.duration ??= await input.computeDuration()
    const title = (await this.getTrackTitle()) ?? null
    const type = await input.getMimeType()
    return {
      filename: this.filename,
      title,
      type,
      duration: this.duration,
      bitrate: null,
    }
  }

  async getArrayAndClose(): Promise<Uint8ArrayEntry> {
    const input = await this.getInput()
    const outputFormat = await this.getOutputFormat()
    if (!outputFormat) {
      const inputFormat = await input.getFormat()
      throw new Error(
        `Failed to save Audiobook entry: could not find valid output format for input with format ${inputFormat.name}`,
      )
    }

    const output = new Output({
      format: outputFormat,
      target: new BufferTarget(),
    })

    const tags = await this.getMetadataTags()

    const conversion = await Conversion.init({
      input,
      output,
      tags: {
        // Since we only write raw metadata tags, we
        // only copy those into the output. Otherwise
        // the unchanged parsed metadata tags will overwrite
        // our changes to raw!
        raw: tags.raw ?? {},
        images: tags.images ?? [],
      },
      showWarnings: false,
    })

    if (!conversion.isValid) {
      throw new Error(
        conversion.discardedTracks.map((track) => track.reason).join(";"),
      )
    }

    await conversion.execute()
    input.dispose()

    return {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      data: new Uint8Array(output.target.buffer!),
      filename: this.filename,
    }
  }
}
