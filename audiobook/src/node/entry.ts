import { type Entry, Uint8ArrayWriter } from "@zip.js/zip.js"
import { type Uint8ArrayEntry } from "../entry.js"
import { File } from "node-taglib-sharp"
import { readFile } from "node:fs/promises"
import { streamFile } from "@smoores/fs"
import { BaseAudiobookEntry } from "../base.js"
import { Uint8ArrayFileAbstraction } from "../taglib/Uint8ArrayFileAbstraction.js"

export class AudiobookEntry extends BaseAudiobookEntry {
  filename: string

  protected file: File | null = null

  constructor(protected entry: string | Uint8ArrayEntry | Entry) {
    super()
    this.filename = typeof entry === "string" ? entry : entry.filename
  }

  override async createFile(): Promise<File> {
    if (typeof this.entry === "string") {
      const file = File.createFromPath(this.entry)

      return file
    }

    const data = await this.readData()
    return File.createFromAbstraction(
      new Uint8ArrayFileAbstraction(this.filename, data),
    )
  }

  override async getData(): Promise<Uint8Array> {
    if (typeof this.entry === "string") {
      return await readFile(this.entry)
    }

    const file = await this.getFile()
    return (file.fileAbstraction as Uint8ArrayFileAbstraction).data
  }

  protected async readData(): Promise<Uint8Array> {
    if (typeof this.entry === "string") {
      return await streamFile(this.entry)
    }

    if ("data" in this.entry) {
      return this.entry.data
    }

    const writer = new Uint8ArrayWriter()
    // It's not clear why .getData is typed as conditional, since it
    // seems to always be defined.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return await this.entry.getData!<Uint8Array>(writer)
  }

  persisted() {
    return typeof this.entry === "string"
  }

  close() {
    this.file?.dispose()
  }
}
