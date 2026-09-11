import { open, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { basename, dirname, extname, join } from "node:path"

import {
  type EmissionData,
  type Emissions,
  decodeEmissions,
  encodeEmissions,
} from "@storyteller-platform/ghost-story"

import { type EmissionTimings } from "../align/ctc/emissions.ts"

export async function writeEmissionsFile(
  path: string,
  data: EmissionData,
  options: { signal?: AbortSignal } = {},
) {
  const encoded = encodeEmissions(data)
  await writeFile(path, encoded, options)
}

export async function readEmissionsFile(
  path: string,
  framesFrom?: number,
  framesTo?: number,
) {
  await using file = await open(path, "r")

  async function getBytes(bytesFrom: number, bytesTo: number) {
    const length = bytesTo - bytesFrom
    const buffer = new Uint8Array(length)

    let read = 0
    while (read < length) {
      const { bytesRead } = await file.read(
        buffer,
        read,
        length - read,
        bytesFrom + read,
      )
      if (bytesRead === 0) break
      read += bytesRead
    }

    return buffer
  }

  return await decodeEmissions(getBytes, framesFrom, framesTo)
}

export async function readEmissionsFileHead(path: string) {
  return await readEmissionsFile(path, 0, 0)
}

function toRows({ values, frames, classes }: Emissions): number[][] {
  return Array.from({ length: frames }, (_, f) =>
    Array.from(values.subarray(f * classes, (f + 1) * classes)),
  )
}

async function packJsonEmissionsFile(path: string) {
  const directory = dirname(path)
  const filebase = basename(path, extname(path))
  const emissionsName = join(directory, `${filebase}.emissions`)

  const jsonData = await readFile(path, { encoding: "utf-8" })
  const parsed = JSON.parse(jsonData) as Omit<
    EmissionData,
    "vocab" | "numFrames" | "emissions" | "frameOffsetSeconds" | "tokenizer"
  > & {
    vocab: Record<string, number>
    emissions: number[][]
    frameOffsetSeconds?: number
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
    frameOffsetSeconds: parsed.frameOffsetSeconds ?? 0,
    tokenizer: null,
  })
  await rm(path)
  return emissionsName
}

export class EmissionsReader {
  private constructor(
    public numFrames: number = 0,
    public frameMap: [string, number, number][],
    public vocab: Map<string, number>,
    public blankId: number,
    public timings: EmissionTimings[],
  ) {}

  private static async getFilepaths(fileOrDirectory: string) {
    if (
      extname(fileOrDirectory) === ".emissions" ||
      extname(fileOrDirectory) === ".json"
    ) {
      return [fileOrDirectory]
    }

    const allFiles = await readdir(fileOrDirectory, { recursive: true })
    return allFiles
      .filter((f) => extname(f) === ".emissions" || extname(f) === ".json")
      .toSorted()
      .map((f) => join(fileOrDirectory, f))
  }

  static async from(fileOrDirectory: string) {
    let vocab: Map<string, number> | null = null
    let blankId: number | null = null
    const timings: EmissionTimings[] = []
    const frameMap: [string, number, number][] = []
    let numFrames = 0

    const emissionsFiles = await EmissionsReader.getFilepaths(fileOrDirectory)

    let f = 0
    for (let path of emissionsFiles) {
      if (extname(path) === ".json") {
        path = await packJsonEmissionsFile(path)
      }
      const {
        numFrames,
        vocab: v,
        blankIndex: b,
        emissions: _,
        tokenizer: __,
        ...emissionTimings
      } = await readEmissionsFileHead(path)
      vocab ??= v
      blankId ??= b
      timings.push(emissionTimings)
      frameMap.push([path, f, f + numFrames])
      f += numFrames
    }
    numFrames = f

    if (vocab === null || blankId === null) {
      throw new Error("Failed to initialize EmissionsReader")
    }

    const reader = new EmissionsReader(
      numFrames,
      frameMap,
      vocab,
      blankId,
      timings,
    )
    return reader
  }

  async *frames() {
    let fileIndex = 0
    let chunkFrom = 0
    let frameIndex = 0

    while (frameIndex < this.numFrames) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const [path, framesStart, framesEnd] = this.frameMap[fileIndex]!
      const chunkTo = Math.min(chunkFrom + 1000, framesEnd - framesStart)
      const { emissions } = await readEmissionsFile(path, chunkFrom, chunkTo)
      for (const row of toRows(emissions)) {
        yield row
      }

      frameIndex += chunkTo - chunkFrom
      if (chunkTo < chunkFrom + 1000) {
        fileIndex++
        chunkFrom = 0
      } else {
        chunkFrom += 1000
      }
    }
  }

  async readFrames(framesFrom: number, framesTo: number) {
    const startFile = this.frameMap.findIndex(([, , end]) => end > framesFrom)
    if (startFile === -1) return []
    let endFile = this.frameMap.findLastIndex(([, start]) => start < framesTo)
    if (endFile === -1) endFile = this.frameMap.length - 1

    const frames: number[][] = []
    for (let i = startFile; i <= endFile; i++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const [path, from, to] = this.frameMap[i]!

      const { emissions } = await readEmissionsFile(
        path,
        Math.max(framesFrom, from) - from,
        Math.min(to, framesTo) - from,
      )

      frames.push(...toRows(emissions))
    }

    return frames
  }
}
