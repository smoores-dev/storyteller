import assert from "node:assert"

import { describe, it } from "vitest"

import {
  encodeUnigram,
  readSentencePieceModel,
  unigramText,
  unigramTokenizer,
} from "../src/index.ts"

function varint(value: number) {
  const bytes: number[] = []
  let rest = value
  while (rest >= 0x80) {
    bytes.push((rest & 0x7f) | 0x80)
    rest = Math.floor(rest / 128)
  }
  bytes.push(rest)
  return bytes
}

function lengthDelimited(field: number, payload: number[]) {
  return [...varint(field * 8 + 2), ...varint(payload.length), ...payload]
}

function float(field: number, value: number) {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setFloat32(0, value, true)
  return [field * 8 + 5, ...bytes]
}

function piece(text: string, score: number, type?: number) {
  const encoded = Array.from(new TextEncoder().encode(text))
  return lengthDelimited(1, [
    ...lengthDelimited(1, encoded),
    ...float(2, score),
    ...(type === undefined ? [] : [3 * 8, type]),
  ])
}

const pieces: [string, number][] = [
  ["<unk>", 0],
  ["▁the", -1],
  ["▁", -3],
  ["t", -2.5],
  ["h", -2.5],
  ["e", -2.5],
  ["▁cat", -1.5],
  ["c", -2.5],
  ["a", -2.5],
  ["▁ca", -2],
  ["ts", -2],
  ["s", -2.5],
]

const modelBytes = Uint8Array.from([
  ...piece("<unk>", 0, 2),
  ...pieces.slice(1).flatMap(([text, score]) => piece(text, score)),
  ...lengthDelimited(2, [3 * 8, 1, 40 * 8, 0]),
])

const vocab = new Map<string, number>(
  pieces.map(([text], index) => [text, index]),
)
vocab.set("<blk>", pieces.length)

describe("readSentencePieceModel", () => {
  it("reads pieces, scores, type and unk id", () => {
    const model = readSentencePieceModel(modelBytes)
    assert.equal(model.type, "unigram")
    assert.equal(model.unkId, 0)
    assert.deepEqual(
      model.pieces,
      pieces.map(([text]) => text),
    )
    assert.deepEqual(
      Array.from(model.scores),
      pieces.map(([, score]) => score),
    )
  })
})

describe("encodeUnigram", () => {
  const tokenizer = unigramTokenizer(readSentencePieceModel(modelBytes), vocab)

  it("pads scores to the vocabulary and keeps the blank at zero", () => {
    assert.equal(tokenizer.scores.length, vocab.size)
    assert.equal(tokenizer.scores[pieces.length], 0)
  })

  it("picks the highest scoring segmentation", () => {
    const { ids, offsets } = encodeUnigram(
      vocab,
      tokenizer,
      unigramText(["the", "cats"]),
    )
    assert.deepEqual(
      Array.from(ids).map((id) => pieces[id]?.[0]),
      ["▁the", "▁ca", "ts"],
    )
    assert.deepEqual(Array.from(offsets), [0, 4, 7, 9])
  })

  it("falls back to unk for characters outside the pieces", () => {
    const { ids, offsets } = encodeUnigram(
      vocab,
      tokenizer,
      unigramText(["the", "x"]),
    )
    assert.deepEqual(
      Array.from(ids).map((id) => pieces[id]?.[0]),
      ["▁the", "▁", "<unk>"],
    )
    assert.deepEqual(Array.from(offsets), [0, 4, 5, 6])
  })

  it("encodes the empty string to no tokens", () => {
    const { ids, offsets } = encodeUnigram(vocab, tokenizer, "")
    assert.equal(ids.length, 0)
    assert.deepEqual(Array.from(offsets), [0])
  })
})
