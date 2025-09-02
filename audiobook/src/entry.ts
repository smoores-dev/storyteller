import { type Entry, Uint8ArrayWriter } from "@zip.js/zip.js"
import { File } from "node-taglib-sharp"

import { BaseAudiobookEntry } from "./base.ts"
import { Uint8ArrayFileAbstraction } from "./taglib/Uint8ArrayFileAbstraction.ts"

export interface Uint8ArrayEntry {
  filename: string
  data: Uint8Array
}

export class AudiobookEntry extends BaseAudiobookEntry {
  filename: string

  protected file: File | null = null

  protected async readData() {
    if ("data" in this.entry) {
      return this.entry.data
    }

    const writer = new Uint8ArrayWriter()
    // It's not clear why .getData is typed as conditional, since it
    // seems to always be defined.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return await this.entry.getData!<Uint8Array>(writer)
  }

  async getData() {
    const file = await this.getFile()
    return (file.fileAbstraction as Uint8ArrayFileAbstraction).data
  }

  override async createFile(): Promise<File> {
    const data = await this.readData()
    return File.createFromAbstraction(
      new Uint8ArrayFileAbstraction(this.filename, data),
    )
  }

  constructor(protected entry: Uint8ArrayEntry | Entry) {
    super()
    this.filename = entry.filename
  }
}
