import { MediaType } from "@storyteller-platform/media-types"

import {
  type AttachedPic,
  type TrackInfo,
  extractCoverArtData,
  getTrackMetadata,
  writeTrackMetadata,
} from "./ffmpeg.ts"
import { type AudiobookChapter, type AudiobookResource } from "./resources.ts"

export interface Uint8ArrayEntry {
  filename: string
  data: Uint8Array
}

function splitNames(names: string | undefined): string[] {
  if (!names) return []
  return names.split(/[;,/]/).map((name) => name.trim())
}

export class AudiobookEntry {
  private info: TrackInfo | null = null
  private coverArt: AttachedPic | null | undefined = undefined

  constructor(public filename: string) {}

  async getInfo(): Promise<TrackInfo> {
    this.info ??= await getTrackMetadata(this.filename)
    return this.info
  }

  async getMetadataTags(): Promise<TrackInfo["tags"]> {
    const info = await this.getInfo()
    return info.tags
  }

  async getRawTags(): Promise<Record<string, string>> {
    const info = await this.getInfo()
    return info.raw
  }

  async getTitle(): Promise<string | null> {
    const tags = await this.getMetadataTags()
    return tags.album ?? tags.title ?? null
  }

  async setTitle(title: string): Promise<void> {
    const tags = await this.getMetadataTags()
    tags.album = title
  }

  async getTrackTitle(): Promise<string | null> {
    const tags = await this.getMetadataTags()
    return tags.title ?? null
  }

  async setTrackTitle(trackTitle: string): Promise<void> {
    const tags = await this.getMetadataTags()
    tags.title = trackTitle
  }

  async getSubtitle(): Promise<string | null> {
    const tags = await this.getMetadataTags()
    return tags.subtitle ?? null
  }

  async setSubtitle(subtitle: string): Promise<void> {
    const tags = await this.getMetadataTags()
    tags.subtitle = subtitle
  }

  async getDescription(): Promise<string | null> {
    const tags = await this.getMetadataTags()
    return tags.description ?? tags.comment ?? null
  }

  async setDescription(description: string): Promise<void> {
    const tags = await this.getMetadataTags()
    tags.description = description
    tags.comment = description
  }

  async getAuthors(): Promise<string[]> {
    const tags = await this.getMetadataTags()
    return splitNames(tags.albumArtist ?? tags.artist)
  }

  async setAuthors(authors: string[]): Promise<void> {
    const tags = await this.getMetadataTags()
    tags.artist = authors.join(";")
    tags.albumArtist = authors.join(";")
  }

  async getNarrators(): Promise<string[]> {
    const tags = await this.getMetadataTags()
    return splitNames(tags.composer ?? tags.performer)
  }

  async setNarrators(narrators: string[]): Promise<void> {
    const tags = await this.getMetadataTags()
    tags.composer = narrators.join(";")
    tags.performer = narrators.join(";")
  }

  async getCoverArt(): Promise<AttachedPic | null> {
    if (this.coverArt !== undefined) return this.coverArt

    const info = await this.getInfo()

    if (!info.attachedPicMeta) {
      this.coverArt = null
      return null
    }

    const data = await extractCoverArtData(this.filename)
    this.coverArt = { ...info.attachedPicMeta, data }

    return this.coverArt
  }

  setCoverArt(picture: AttachedPic): void {
    this.coverArt = picture
  }

  async getPublisher(): Promise<string | null> {
    const tags = await this.getMetadataTags()
    return tags.publisher ?? null
  }

  async setPublisher(publisher: string): Promise<void> {
    const tags = await this.getMetadataTags()
    tags.publisher = publisher
  }

  async getReleaseDate(): Promise<Date | null> {
    const tags = await this.getMetadataTags()
    return tags.date ? new Date(tags.date) : null
  }

  async setReleaseDate(date: Date): Promise<void> {
    const tags = await this.getMetadataTags()
    tags.date = `${date.getDate().toString().padStart(2, "0")}-${date.getMonth().toString().padStart(2, "0")}-${date.getFullYear()}`
  }

  async getDuration(): Promise<number> {
    const info = await this.getInfo()
    return info.duration
  }

  async getBitRate(): Promise<number | undefined> {
    const info = await this.getInfo()
    return info.bitRate
  }

  async getResource(): Promise<AudiobookResource> {
    const duration = await this.getDuration()
    const bitrate = (await this.getBitRate()) ?? null
    const title = (await this.getTrackTitle()) ?? null
    const mediaType = MediaType.fromPath(this.filename)
    const type = (mediaType?.is("audio") ? mediaType : MediaType.OCTET_STREAM)
      .mime
    return {
      filename: this.filename,
      title,
      type,
      duration,
      bitrate,
    }
  }

  async getChapters(): Promise<AudiobookChapter[]> {
    const info = await this.getInfo()
    return info.chapters.map((chapter) => ({
      filename: this.filename,
      title: chapter.title ?? null,
      start: chapter.startTime,
    }))
  }

  async setChapters(chapters: AudiobookChapter[]): Promise<void> {
    const info = await this.getInfo()
    const duration = await this.getDuration()
    const ffmpegChapters: TrackInfo["chapters"] = []
    for (let i = 0; i < ffmpegChapters.length; i++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const chapter = chapters[i]!
      const prevFfmpegChapter = ffmpegChapters[i - 1]

      ffmpegChapters.push({
        id: i,
        startTime: chapter.start ?? 0,
        title: chapter.title ?? `ch${i}`,
        endTime: duration,
      })

      if (prevFfmpegChapter) {
        prevFfmpegChapter.endTime = chapter.start ?? 0
      }
    }
    info.chapters = ffmpegChapters
  }

  async saveAndClose(): Promise<void> {
    const info = await this.getInfo()

    let attachedPic: AttachedPic | undefined

    if (this.coverArt !== undefined) {
      attachedPic = this.coverArt ?? undefined
    } else if (info.attachedPicMeta) {
      const data = await extractCoverArtData(this.filename)
      attachedPic = { ...info.attachedPicMeta, data }
    }

    await writeTrackMetadata(this.filename, info, attachedPic)
  }
}
