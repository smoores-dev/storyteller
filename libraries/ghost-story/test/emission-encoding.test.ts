import assert from "node:assert"
import { describe, it } from "node:test"

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
const rows = [
  [0, -1, -2, -3],
  [-1, 0, -2, -3],
  [-2, -1, 0, -3],
  [-3, -2, -1, 0],
  [0, -1, -2, -3],
]
const emissions = {
  values: Float32Array.from(rows.flat()),
  frames: rows.length,
  classes: 4,
}

void describe("encodeEmissions", () => {
  void it("should round-trip", async () => {
    const [head, body] = encodeEmissions({
      vocab,
      blankIndex: blankId,
      secondsPerChunk,
      secondsPerFrame,
      framesPerChunk,
      frameOffsetSeconds: 0,
      tokenizer: null,
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

  void it("should pack data", () => {
    const [head, body] = encodeEmissions({
      vocab,
      blankIndex: blankId,
      secondsPerChunk,
      secondsPerFrame,
      framesPerChunk,
      frameOffsetSeconds: 0,
      tokenizer: null,
      emissions,
      numFrames: emissions.frames,
    })

    assert.equal(head.length, 96)
    assert.equal(body.length, 40)
  })

  void it("should round-trip a tokenizer and frame offset", async () => {
    const tokenizer = {
      kind: "unigram" as const,
      scores: Float32Array.from([0, -1.5, -2.25, 0]),
      unkId: 1,
    }
    const [head, body] = encodeEmissions({
      vocab,
      blankIndex: blankId,
      secondsPerChunk,
      secondsPerFrame,
      framesPerChunk,
      frameOffsetSeconds: -0.14,
      tokenizer,
      emissions,
      numFrames: emissions.frames,
    })
    assert.equal(head.length, 112)
    const encoded = new Uint8Array(head.length + body.length)
    encoded.set(head)
    encoded.set(body, head.length)
    const data = await decodeEmissions((from, to) =>
      Promise.resolve(encoded.slice(from, to)),
    )

    assert.deepEqual(data.emissions, emissions)
    assert.deepEqual(data.vocab, vocab)
    assert.deepEqual(data.tokenizer, tokenizer)
    assert.equal(data.frameOffsetSeconds, -0.14)
  })

  void it("should keep the top 16 of a wide vocabulary and floor the rest", async () => {
    const classes = 200
    const frames = 3
    const wideVocab = new Map<string, number>()
    for (let i = 0; i < classes; i++) wideVocab.set(`t${i}`, i)
    const values = new Float32Array(frames * classes)
    for (let frame = 0; frame < frames; frame++) {
      for (let c = 0; c < classes; c++) {
        values[frame * classes + c] = -((c * 7 + frame * 13) % classes) - 1
      }
    }
    const [head, body] = encodeEmissions({
      vocab: wideVocab,
      blankIndex: 0,
      secondsPerChunk,
      secondsPerFrame,
      framesPerChunk,
      frameOffsetSeconds: 0,
      tokenizer: null,
      emissions: { values, frames, classes },
      numFrames: frames,
    })
    assert.equal(body.length, frames * 16 * 4)
    const encoded = new Uint8Array(head.length + body.length)
    encoded.set(head)
    encoded.set(body, head.length)
    const data = await decodeEmissions((from, to) =>
      Promise.resolve(encoded.slice(from, to)),
    )
    assert.equal(data.emissions.frames, frames)
    for (let frame = 0; frame < frames; frame++) {
      const row = Array.from(
        values.subarray(frame * classes, (frame + 1) * classes),
      )
      const decoded = data.emissions.values.subarray(
        frame * classes,
        (frame + 1) * classes,
      )
      const floor = row.toSorted((a, b) => b - a)[15] ?? -Infinity
      for (const [c, value] of row.entries()) {
        assert.equal(decoded[c], value >= floor ? value : floor)
      }
    }
  })
})

void describe("decodeEmissions", () => {
  void it("should only decode the requested bytes", async () => {
    const [head, body] = encodeEmissions({
      vocab,
      blankIndex: blankId,
      secondsPerChunk,
      secondsPerFrame,
      framesPerChunk,
      frameOffsetSeconds: 0,
      tokenizer: null,
      emissions,
      numFrames: emissions.frames,
    })
    const encoded = new Uint8Array(head.length + body.length)
    encoded.set(head)
    encoded.set(body, head.length)

    function getHeadMeta(from: number, to: number) {
      assert.equal(from, 0)
      assert.equal(to, 44)
      getData = getExtra
      return Promise.resolve(encoded.slice(from, to))
    }

    function getExtra(from: number, to: number) {
      assert.equal(from, 44)
      assert.equal(to, 60)
      getData = getVocab
      return Promise.resolve(encoded.slice(from, to))
    }

    function getVocab(from: number, to: number) {
      assert.equal(from, 60)
      assert.equal(to, 96)
      getData = getBody
      return Promise.resolve(encoded.slice(from, to))
    }

    function getBody(from: number, to: number) {
      assert.equal(from, 104)
      assert.equal(to, 112)
      return Promise.resolve(encoded.slice(from, to))
    }

    let getData: (from: number, to: number) => Promise<Uint8Array> = getHeadMeta

    await decodeEmissions((from, to) => getData(from, to), 1, 2)
  })
})
