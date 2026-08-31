import assert from "node:assert"
import { join } from "node:path"
import { cwd } from "node:process"
import { describe, it } from "node:test"

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

void describe("EmissionsReader", () => {
  void it("should read header data correctly", async () => {
    const path = join(cwd(), "src", "emit", "__fixtures__")
    const reader = await EmissionsReader.from(path)

    assert.deepEqual(reader.vocab, vocab)
    assert.equal(reader.blankId, blankId)
    assert.deepEqual(reader.timings[0], {
      secondsPerChunk,
      secondsPerFrame,
      framesPerChunk,
    })
  })

  void it("should iterate over frames", async () => {
    const path = join(cwd(), "src", "emit", "__fixtures__")
    const reader = await EmissionsReader.from(path)

    let i = 0
    for await (const frame of reader.frames()) {
      assert.deepEqual(frame, emissions[i++])
    }
    assert.equal(i, emissions.length)
  })

  void it("should read chunks of frames", async () => {
    const path = join(cwd(), "src", "emit", "__fixtures__")
    const reader = await EmissionsReader.from(path)

    const frames = await reader.readFrames(1, 2)
    assert.deepEqual(frames, emissions.slice(1, 2))
  })

  void it("should read chunks of frames across file boundaries", async () => {
    const path = join(cwd(), "src", "emit", "__fixtures__")
    const reader = await EmissionsReader.from(path)

    const frames = await reader.readFrames(2, 6)
    assert.deepEqual(frames, emissions.slice(2, 6))
  })
})
