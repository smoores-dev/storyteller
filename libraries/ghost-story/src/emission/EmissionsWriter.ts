import { type FileHandle, open, rm } from "node:fs/promises"

import { type Emissions } from "./Emissions.ts"
import {
  type EmissionsMeta,
  encodeEmissionsFrames,
  encodeEmissionsHeader,
} from "./encoding.ts"

export class EmissionsWriter implements AsyncDisposable {
  private frames = 0
  private offset: number
  private finished = false

  private constructor(
    readonly path: string,
    private readonly file: FileHandle,
    private readonly classes: number,
    private readonly headerBytes: number,
  ) {
    this.offset = headerBytes
  }

  static async create(
    path: string,
    meta: EmissionsMeta,
  ): Promise<EmissionsWriter> {
    const head = encodeEmissionsHeader(meta, 0)
    const file = await open(path, "w")
    const writer = new EmissionsWriter(path, file, meta.classes, head.length)
    try {
      await writer.write(head, 0)
    } catch (error) {
      await writer[Symbol.asyncDispose]()
      throw error
    }
    return writer
  }

  async append(emissions: Emissions): Promise<void> {
    if (emissions.classes !== this.classes) {
      throw new Error(
        `Failed to append emissions to ${this.path}; frames have ${emissions.classes} classes, expected ${this.classes}`,
      )
    }
    const bytes = encodeEmissionsFrames(emissions)
    await this.write(bytes, this.offset)
    this.offset += bytes.length
    this.frames += emissions.frames
  }

  async finish(meta: EmissionsMeta): Promise<number> {
    const head = encodeEmissionsHeader(meta, this.frames)
    if (head.length !== this.headerBytes) {
      throw new Error(
        `Failed to finish ${this.path}; the header grew from ${this.headerBytes} to ${head.length} bytes`,
      )
    }
    await this.write(head, 0)
    await this.file.close()
    this.finished = true
    return this.frames
  }

  private async write(bytes: Uint8Array, position: number) {
    let written = 0
    while (written < bytes.length) {
      const { bytesWritten } = await this.file.write(
        bytes,
        written,
        bytes.length - written,
        position + written,
      )
      written += bytesWritten
    }
  }

  async [Symbol.asyncDispose](): Promise<void> {
    if (this.finished) {
      return
    }
    await this.file.close()
    await rm(this.path, { force: true })
  }
}
