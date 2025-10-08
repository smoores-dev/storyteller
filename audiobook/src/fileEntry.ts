import { writeFile } from "node:fs/promises"

import { type PortablePath, npath } from "@yarnpkg/fslib"
import { ALL_FORMATS, FilePathSource, Input } from "mediabunny"

import { AudiobookEntry } from "./entry.ts"
import { getTrackChapters } from "./ffmpeg.ts"
import { type AudiobookChapter } from "./resources.ts"

export class FileEntry extends AudiobookEntry {
  private input: Input | null = null

  constructor(public override filename: PortablePath) {
    super()
  }

  override getInput() {
    this.input ??= new Input({
      formats: ALL_FORMATS,
      source: new FilePathSource(npath.fromPortablePath(this.filename)),
    })

    return this.input
  }

  public override async getChapters(): Promise<AudiobookChapter[]> {
    const chapters = await getTrackChapters(this.filename)
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
