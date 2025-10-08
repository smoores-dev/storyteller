import { writeFile } from "node:fs/promises"

import { ALL_FORMATS, BufferSource, Input } from "mediabunny"

import { AudiobookEntry, type Uint8ArrayEntry } from "./entry.ts"
import { getTrackChaptersFromBuffer } from "./ffmpeg.ts"
import { type AudiobookChapter } from "./resources.ts"

export class BufferEntry extends AudiobookEntry {
  private input: Input | null = null
  public override filename: string

  constructor(private entry: Uint8ArrayEntry) {
    super()
    this.filename = entry.filename
  }

  override getInput() {
    this.input ??= new Input({
      formats: ALL_FORMATS,
      source: new BufferSource(this.entry.data),
    })

    return this.input
  }

  public override async getChapters(): Promise<AudiobookChapter[]> {
    const chapters = await getTrackChaptersFromBuffer(this.entry.data)
    return chapters.map((chapter) => ({
      filename: this.filename,
      title: chapter.title,
      start: chapter.startTime,
    }))
  }

  override async saveAndClose(): Promise<void> {
    const { data, filename } = await this.getArrayAndClose()
    await writeFile(filename, data)
  }
}
