import assert from "node:assert"
import { join } from "node:path"
import { cwd } from "node:process"

import { describe, it } from "vitest"

import { EmissionsReader } from "../fs.ts"

const vocab = new Map([
  ["<blank>", 0],
  ["a", 1],
  ["b", 2],
  ["c", 3],
])
const blankId = 0
const secondsPerChunk = 25
const secondsPerFrame = 0.02
const framesPerChunk = 125
const emissions = [
  // file 1
  [0, -1, -2, -3],
  [-1, 0, -2, -3],
  [-2, -1, 0, -3],
  [-3, -2, -1, 0],
  [0, -1, -2, -3],
  // file 2
  [0, -1, -2, -3],
  [-1, 0, -2, -3],
  [-2, -1, 0, -3],
  [-3, -2, -1, 0],
  [0, -1, -2, -3],
]

describe("EmissionsReader", () => {
  it("should read header data correctly", async () => {
    const path = join(cwd(), "src", "emit", "__fixtures__")
    const reader = await EmissionsReader.from(path)

    assert.deepEqual(reader.vocab, vocab)
    assert.equal(reader.blankId, blankId)
    assert.deepEqual(reader.timings[0], {
      secondsPerChunk,
      secondsPerFrame,
      framesPerChunk,
      startOffsetSeconds: 0,
      endOffsetSeconds: 0,
    })
  })

  it("should iterate over frames", async () => {
    const path = join(cwd(), "src", "emit", "__fixtures__")
    const reader = await EmissionsReader.from(path)

    const rows: number[][] = []
    for await (const { values, frames, classes } of reader.blocks()) {
      for (let f = 0; f < frames; f++) {
        rows.push(Array.from(values.subarray(f * classes, (f + 1) * classes)))
      }
    }
    assert.deepEqual(rows, emissions)
  })

  it("should read chunks of frames", async () => {
    const path = join(cwd(), "src", "emit", "__fixtures__")
    const reader = await EmissionsReader.from(path)

    const { values, frames, classes } = await reader.readFrames(1, 2)
    assert.equal(frames, 1)
    assert.equal(classes, 4)
    assert.deepEqual(Array.from(values), emissions.slice(1, 2).flat())
  })

  it("should read chunks of frames across file boundaries", async () => {
    const path = join(cwd(), "src", "emit", "__fixtures__")
    const reader = await EmissionsReader.from(path)

    const { values, frames } = await reader.readFrames(2, 6)
    assert.equal(frames, 4)
    assert.deepEqual(Array.from(values), emissions.slice(2, 6).flat())
  })
})
