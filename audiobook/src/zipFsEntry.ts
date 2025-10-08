import { type PortablePath } from "@yarnpkg/fslib"
import { type ZipFS } from "@yarnpkg/libzip"
import { ALL_FORMATS, BufferSource, Input } from "mediabunny"

import { AudiobookEntry } from "./entry.ts"
import { getTrackChaptersFromBuffer } from "./ffmpeg.ts"
import { type AudiobookChapter } from "./resources.ts"

export class ZipFSEntry extends AudiobookEntry {
  private input: Input | null = null
  private data: NonSharedBuffer | null = null

  constructor(
    public zipFs: ZipFS,
    public override filename: PortablePath,
  ) {
    super()
  }

  override async getInput() {
    if (this.input) return this.input
    this.data ??= await this.zipFs.readFilePromise(this.filename)

    this.input = new Input({
      formats: ALL_FORMATS,
      source: new BufferSource(this.data),
    })

    return this.input
  }

  public override async getChapters(): Promise<AudiobookChapter[]> {
    this.data ??= await this.zipFs.readFilePromise(this.filename)
    const chapters = await getTrackChaptersFromBuffer(this.data)
    return chapters.map((chapter) => ({
      filename: this.filename,
      title: chapter.title,
      start: chapter.startTime,
    }))
  }

  override async saveAndClose(): Promise<void> {
    const { data } = await this.getArrayAndClose()

    await this.zipFs.writeFilePromise(
      this.filename,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      new Uint8Array(data),
    )
  }
}
