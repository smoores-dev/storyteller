import { type TimingSummary } from "../utilities/Timing.ts"

export interface EmissionWireResult {
  vocab: Record<string, number>
  blankIndex: number
  secondsPerChunk: number
  framesPerChunk: number
  secondsPerFrame: number
  frames: number
  dims: number
  emissions: string
  timing: TimingSummary
}

export function encodeEmissions(emissions: number[][]): {
  emissions: string
  frames: number
  dims: number
} {
  const frames = emissions.length
  const dims = emissions[0]?.length ?? 0
  const buffer = Buffer.allocUnsafe(frames * dims * 4)

  let offset = 0
  for (const row of emissions) {
    if (row.length !== dims) {
      throw new Error(
        `Ragged emission matrix: expected ${dims} values per frame, got ${row.length}`,
      )
    }
    for (const value of row) {
      offset = buffer.writeFloatLE(value, offset)
    }
  }

  return { emissions: buffer.toString("base64"), frames, dims }
}

export function decodeEmissions(
  encoded: string,
  frames: number,
  dims: number,
): number[][] {
  const buffer = Buffer.from(encoded, "base64")
  const expectedBytes = frames * dims * 4

  if (buffer.length !== expectedBytes) {
    throw new Error(
      `Emission payload has ${buffer.length} bytes, expected ${expectedBytes} for ${frames}x${dims}`,
    )
  }

  const rows: number[][] = []
  for (let frame = 0; frame < frames; frame++) {
    const row = new Array<number>(dims)
    for (let dim = 0; dim < dims; dim++) {
      row[dim] = buffer.readFloatLE((frame * dims + dim) * 4)
    }
    rows.push(row)
  }

  return rows
}
