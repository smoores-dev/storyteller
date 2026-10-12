import { createWriteStream } from "node:fs"
import {
  type FileHandle,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import { basename, dirname, extname, join } from "node:path"
import { type Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { setTimeout } from "node:timers/promises"

import { isHiddenFile } from "@storyteller-platform/fs"
import {
  type EmissionData,
  type Emissions,
  type EmissionsFileHeader,
  decodeEmissionsFrames,
  decodeEmissionsHeader,
  encodeEmissions,
  frameByteRange,
} from "@storyteller-platform/ghost-story"

import { type EmissionTimings } from "../align/ctc/emissions.ts"

export async function writeEmissionsFile(
  path: string,
  data: EmissionData,
  options: { signal?: AbortSignal | undefined } = {},
) {
  const partial = `${path}.partial`
  try {
    await writeFile(partial, encodeEmissions(data), options)
    await replaceFile(partial, path)
  } catch (error) {
    await rm(partial, { force: true })
    throw error
  }
}

export async function writeEmissionsStream(
  path: string,
  stream: Readable,
  options: { signal?: AbortSignal | undefined } = {},
) {
  const partial = `${path}.partial`
  try {
    await pipeline(stream, createWriteStream(partial), options)
    const header = await readEmissionsHeader(partial)
    const [, end] = frameByteRange(header)
    const { size } = await stat(partial)

    if (size !== end) {
      throw new Error(
        `Received a truncated emissions file for ${path}, expected ${end} bytes and got ${size}`,
      )
    }
    await replaceFile(partial, path)
  } catch (error) {
    await rm(partial, { force: true })
    throw error
  }
}

export async function replaceFile(from: string, to: string) {
  // annoying retry logic necessary for when eg windows defender is blocking access to the file
  for (let attempt = 1; ; attempt++) {
    try {
      await rename(from, to)
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (
        attempt >= 5 ||
        (code !== "EPERM" && code !== "EACCES" && code !== "EBUSY")
      ) {
        throw error
      }
      await setTimeout(100 * attempt)
    }
  }
}

async function readExactly(handle: FileHandle, from: number, to: number) {
  const length = to - from
  const buffer = new Uint8Array(length)

  let read = 0
  while (read < length) {
    const { bytesRead } = await handle.read(
      buffer,
      read,
      length - read,
      from + read,
    )
    if (bytesRead === 0) {
      throw new Error(
        `Emissions file is truncated; wanted bytes ${from}-${to}, file ended at ${from + read}`,
      )
    }
    read += bytesRead
  }

  return buffer
}

export async function readEmissionsHeader(
  path: string,
): Promise<EmissionsFileHeader> {
  await using file = await open(path, "r")
  return await decodeEmissionsHeader((from, to) => readExactly(file, from, to))
}

async function readFramesFrom(
  file: FileHandle,
  header: EmissionsFileHeader,
  framesFrom?: number,
  framesTo?: number,
): Promise<Emissions> {
  const [start, end] = frameByteRange(header, framesFrom, framesTo)
  return decodeEmissionsFrames(header, await readExactly(file, start, end))
}

export async function readEmissionsFrames(
  path: string,
  header: EmissionsFileHeader,
  framesFrom?: number,
  framesTo?: number,
): Promise<Emissions> {
  await using file = await open(path, "r")
  return await readFramesFrom(file, header, framesFrom, framesTo)
}

async function packJsonEmissionsFile(path: string) {
  const directory = dirname(path)
  const filebase = basename(path, extname(path))
  const emissionsName = join(directory, `${filebase}.emissions`)

  const jsonData = await readFile(path, { encoding: "utf-8" })
  const parsed = JSON.parse(jsonData) as Omit<
    EmissionData,
    | "vocab"
    | "numFrames"
    | "emissions"
    | "startOffsetSeconds"
    | "endOffsetSeconds"
    | "tokenizer"
  > & {
    vocab: Record<string, number>
    emissions: number[][]
    startOffsetSeconds?: number
    endOffsetSeconds?: number
  }

  const rows = parsed.emissions
  const classes = rows[0]?.length ?? 0
  const values = new Float32Array(rows.length * classes)
  rows.forEach((row, i) => {
    values.set(row, i * classes)
  })

  await writeEmissionsFile(emissionsName, {
    ...parsed,
    emissions: { values, frames: rows.length, classes },
    vocab: new Map(Object.entries(parsed.vocab)),
    numFrames: rows.length,
    startOffsetSeconds: parsed.startOffsetSeconds ?? 0,
    endOffsetSeconds: parsed.endOffsetSeconds ?? 0,
    tokenizer: null,
  })
  await rm(path)
  return emissionsName
}

const MASKED_LOG_PROB = -1e4

const BLOCK_FRAMES = 1000

export class EmissionsReader {
  private masks: [number, number][] = []

  private constructor(
    public numFrames: number,
    public frameMap: [string, number, number][],
    public vocab: Map<string, number>,
    public blankId: number,
    public timings: EmissionTimings[],
    public tokenizer: EmissionData["tokenizer"],
    private readonly headers: Map<string, EmissionsFileHeader>,
  ) {}

  withMasks(masks: [number, number][]): EmissionsReader {
    const reader = new EmissionsReader(
      this.numFrames,
      this.frameMap,
      this.vocab,
      this.blankId,
      this.timings,
      this.tokenizer,
      this.headers,
    )
    reader.masks = masks
      .filter(([start, end]) => end > start)
      .toSorted((a, b) => a[0] - b[0])
    return reader
  }

  private mask({ values, frames, classes }: Emissions, firstFrame: number) {
    for (const [start, end] of this.masks) {
      const from = Math.max(start, firstFrame)
      const to = Math.min(end, firstFrame + frames)
      for (let frame = from; frame < to; frame++) {
        const row = (frame - firstFrame) * classes
        values.fill(MASKED_LOG_PROB, row, row + classes)
        values[row + this.blankId] = 0
      }
    }
  }

  private header(path: string) {
    const header = this.headers.get(path)
    if (!header) {
      throw new Error(`No header loaded for ${path}`)
    }
    return header
  }

  private static async getFilepaths(fileOrDirectory: string) {
    if (
      extname(fileOrDirectory) === ".emissions" ||
      extname(fileOrDirectory) === ".json"
    ) {
      return [fileOrDirectory]
    }

    const allFiles = await readdir(fileOrDirectory, { recursive: true })
    return allFiles
      .filter(
        (f) =>
          !isHiddenFile(f) &&
          (extname(f) === ".emissions" || extname(f) === ".json"),
      )
      .toSorted()
      .map((f) => join(fileOrDirectory, f))
  }

  static async from(fileOrDirectory: string) {
    const paths = await EmissionsReader.getFilepaths(fileOrDirectory)

    const headers = new Map<string, EmissionsFileHeader>()
    const timings: EmissionTimings[] = []
    const frameMap: [string, number, number][] = []
    let first: EmissionsFileHeader | null = null
    let frame = 0

    for (let path of paths) {
      if (extname(path) === ".json") {
        path = await packJsonEmissionsFile(path)
      }
      const header = await readEmissionsHeader(path)

      first ??= header
      if (
        header.classes !== first.classes ||
        header.blankIndex !== first.blankIndex ||
        header.secondsPerFrame !== first.secondsPerFrame
      ) {
        throw new Error(
          `${path} was produced by a different model than ${paths[0] ?? ""}`,
        )
      }

      headers.set(path, header)
      timings.push({
        secondsPerChunk: header.secondsPerChunk,
        secondsPerFrame: header.secondsPerFrame,
        framesPerChunk: header.framesPerChunk,
        startOffsetSeconds: header.startOffsetSeconds,
        endOffsetSeconds: header.endOffsetSeconds,
      })
      frameMap.push([path, frame, frame + header.numFrames])
      frame += header.numFrames
    }

    if (first === null) {
      throw new Error(`No emissions files found in ${fileOrDirectory}`)
    }

    return new EmissionsReader(
      frame,
      frameMap,
      first.vocab,
      first.blankIndex,
      timings,
      first.tokenizer,
      headers,
    )
  }

  async *blocks() {
    for (const [path, start, end] of this.frameMap) {
      const header = this.header(path)
      const length = end - start
      if (length === 0) {
        continue
      }
      await using file = await open(path, "r")
      for (let from = 0; from < length; from += BLOCK_FRAMES) {
        const to = Math.min(from + BLOCK_FRAMES, length)
        const emissions = await readFramesFrom(file, header, from, to)
        this.mask(emissions, start + from)
        yield emissions
      }
    }
  }

  async readFrames(framesFrom: number, framesTo: number): Promise<Emissions> {
    const startFile = this.frameMap.findIndex(([, , end]) => end > framesFrom)
    if (startFile === -1) {
      return { values: new Float32Array(0), frames: 0, classes: 0 }
    }
    let endFile = this.frameMap.findLastIndex(([, start]) => start < framesTo)
    if (endFile === -1) {
      endFile = this.frameMap.length - 1
    }

    const blocks: Emissions[] = []
    for (let i = startFile; i <= endFile; i++) {
      const [path, from, to] = this.frameMap[i] as [string, number, number]

      const emissions = await readEmissionsFrames(
        path,
        this.header(path),
        Math.max(framesFrom, from) - from,
        Math.min(to, framesTo) - from,
      )
      this.mask(emissions, Math.max(framesFrom, from))
      blocks.push(emissions)
    }

    const classes = blocks[0]?.classes ?? 0
    const frames = blocks.reduce((acc, block) => acc + block.frames, 0)
    const values = new Float32Array(frames * classes)
    let offset = 0
    for (const block of blocks) {
      values.set(block.values, offset)
      offset += block.values.length
    }
    return { values, frames, classes }
  }
}
