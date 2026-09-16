import assert from "node:assert"

import { describe, it } from "vitest"

import { decodeEmissions, encodeEmissions } from "../src/index.ts"

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
const emissions = {
  values: new Float32Array([
    0, -1, -2, -3, -1, 0, -2, -3, -2, -1, 0, -3, -3, -2, -1, 0, 0, -1, -2, -3,
  ]),
  frames: 5,
  classes: 4,
}

describe("encodeEmissions", () => {
  it("should round-trip", async () => {
    const [head, body] = encodeEmissions({
      vocab,
      blankIndex: blankId,
      secondsPerChunk,
      secondsPerFrame,
      framesPerChunk,
      emissions,
      numFrames: emissions.frames,
    })
    const encoded = new Uint8Array(head.length + body.length)
    encoded.set(head)
    encoded.set(body, head.length)
    const data = await decodeEmissions((from, to) =>
      Promise.resolve(encoded.slice(from, to)),
    )

    assert.deepEqual(data.emissions, emissions)
    assert.deepEqual(data.vocab, vocab)
    assert.equal(data.blankIndex, blankId)
    assert.equal(data.framesPerChunk, framesPerChunk)
    assert.equal(data.secondsPerChunk, secondsPerChunk)
    assert.equal(data.secondsPerFrame, secondsPerFrame)
    assert.equal(data.numFrames, emissions.frames)
  })

  it("should pack data", () => {
    const [head, body] = encodeEmissions({
      vocab,
      blankIndex: blankId,
      secondsPerChunk,
      secondsPerFrame,
      framesPerChunk,
      emissions,
      numFrames: emissions.frames,
    })

    assert.equal(head.length, 80)
    assert.equal(body.length, 80)
  })
})

describe("decodeEmissions", () => {
  it("should only decode the requested bytes", async () => {
    const [head, body] = encodeEmissions({
      vocab,
      blankIndex: blankId,
      secondsPerChunk,
      secondsPerFrame,
      framesPerChunk,
      emissions,
      numFrames: emissions.frames,
    })
    const encoded = new Uint8Array(head.length + body.length)
    encoded.set(head)
    encoded.set(body, head.length)

    function getHeadMeta(from: number, to: number) {
      assert.equal(from, 0)
      assert.equal(to, 44)
      getData = getVocab
      return Promise.resolve(encoded.slice(from, to))
    }

    function getVocab(from: number, to: number) {
      assert.equal(from, 44)
      assert.equal(to, 80)
      getData = getBody
      return Promise.resolve(encoded.slice(from, to))
    }

    function getBody(from: number, to: number) {
      assert.equal(from, 96)
      assert.equal(to, 112)
      return Promise.resolve(encoded.slice(from, to))
    }

    let getData: (from: number, to: number) => Promise<Uint8Array> = getHeadMeta

    await decodeEmissions((from, to) => getData(from, to), 1, 2)
  })
})
