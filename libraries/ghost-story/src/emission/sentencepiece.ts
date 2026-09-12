import { type EmissionTokenizer } from "./Emissions.ts"

export interface SentencePieceModel {
  type: "unigram" | "bpe" | "word" | "char"
  pieces: string[]
  scores: Float32Array
  unkId: number
}

const MODEL_TYPES: Record<number, SentencePieceModel["type"]> = {
  1: "unigram",
  2: "bpe",
  3: "word",
  4: "char",
}

const PIECE_TYPE_UNKNOWN = 2

const UNK_PENALTY = 10

const WORD_BOUNDARY = "▁"

type Field =
  | { number: number; wireType: 0; value: number }
  | { number: number; wireType: 1 | 2 | 5; value: Uint8Array }

function* fields(
  bytes: Uint8Array,
  start: number,
  end: number,
): Generator<Field> {
  let pos = start
  function varint() {
    let value = 0
    let shift = 0
    for (;;) {
      const byte = bytes[pos]
      if (byte === undefined) {
        throw new Error("sentencepiece model is truncated")
      }
      pos++
      value += (byte & 0x7f) * 2 ** shift
      if (byte < 0x80) return value
      shift += 7
    }
  }
  while (pos < end) {
    const tag = varint()
    const number = Math.floor(tag / 8)
    const wireType = tag & 7
    switch (wireType) {
      case 0:
        yield { number, wireType, value: varint() }
        break
      case 1:
        yield { number, wireType, value: bytes.subarray(pos, pos + 8) }
        pos += 8
        break
      case 2: {
        const length = varint()
        yield { number, wireType, value: bytes.subarray(pos, pos + length) }
        pos += length
        break
      }
      case 5:
        yield { number, wireType, value: bytes.subarray(pos, pos + 4) }
        pos += 4
        break
      default:
        throw new Error(
          `sentencepiece model has unsupported wire type ${wireType}`,
        )
    }
  }
}

function float32(bytes: Uint8Array) {
  return new DataView(bytes.buffer, bytes.byteOffset, 4).getFloat32(0, true)
}

export function readSentencePieceModel(bytes: Uint8Array): SentencePieceModel {
  const decoder = new TextDecoder()
  const pieces: string[] = []
  const scores: number[] = []
  let unkId: number | null = null
  let type: SentencePieceModel["type"] | null = null
  let trainerUnkId = 0

  for (const field of fields(bytes, 0, bytes.length)) {
    if (field.number === 1 && field.wireType === 2) {
      let piece = ""
      let score = 0
      let pieceType = 1
      for (const inner of fields(field.value, 0, field.value.length)) {
        if (inner.number === 1 && inner.wireType === 2)
          piece = decoder.decode(inner.value)
        if (inner.number === 2 && inner.wireType === 5)
          score = float32(inner.value)
        if (inner.number === 3 && inner.wireType === 0) pieceType = inner.value
      }
      if (pieceType === PIECE_TYPE_UNKNOWN) unkId = pieces.length
      pieces.push(piece)
      scores.push(score)
    } else if (field.number === 2 && field.wireType === 2) {
      for (const inner of fields(field.value, 0, field.value.length)) {
        if (inner.number === 3 && inner.wireType === 0)
          type = MODEL_TYPES[inner.value] ?? null
        if (inner.number === 40 && inner.wireType === 0)
          trainerUnkId = inner.value
      }
    }
  }

  if (type === null) {
    throw new Error("sentencepiece model does not declare a model type")
  }

  return {
    type,
    pieces,
    scores: Float32Array.from(scores),
    unkId: unkId ?? trainerUnkId,
  }
}

export function unigramTokenizer(
  model: SentencePieceModel,
  vocab: Map<string, number>,
): EmissionTokenizer {
  if (model.type !== "unigram") {
    throw new Error(
      `sentencepiece model type ${model.type} is not supported, only unigram is`,
    )
  }
  const scores = new Float32Array(vocab.size)
  for (const [index, piece] of model.pieces.entries()) {
    if (vocab.get(piece) !== index) {
      throw new Error(
        `sentencepiece piece ${index} ${JSON.stringify(piece)} does not match the vocabulary`,
      )
    }
    scores[index] = model.scores[index] ?? 0
  }
  return { kind: "unigram", scores, unkId: model.unkId }
}

export function encodeUnigram(
  vocab: Map<string, number>,
  tokenizer: EmissionTokenizer,
  text: string,
): { ids: Int32Array; offsets: Int32Array } {
  const pieceIds = new Map<string, number>()
  let maxLength = 1
  let minScore = Infinity
  for (const [piece, id] of vocab) {
    if (
      id === tokenizer.unkId ||
      id >= tokenizer.scores.length ||
      /^<.*>$/.test(piece)
    ) {
      continue
    }
    pieceIds.set(piece, id)
    maxLength = Math.max(maxLength, piece.length)
    minScore = Math.min(minScore, tokenizer.scores[id] ?? 0)
  }
  const unkScore = minScore - UNK_PENALTY

  const length = text.length
  const best = new Float32Array(length + 1).fill(-Infinity)
  const backLength = new Int32Array(length + 1)
  const backId = new Int32Array(length + 1)
  best[0] = 0

  for (let i = 0; i < length; i++) {
    const from = best[i] ?? -Infinity
    if (from === -Infinity) continue
    let single = false
    for (let span = 1; span <= Math.min(maxLength, length - i); span++) {
      const id = pieceIds.get(text.slice(i, i + span))
      if (id === undefined) continue
      if (span === 1) single = true
      const score = Math.fround(from + (tokenizer.scores[id] ?? 0))
      if (score > (best[i + span] ?? -Infinity)) {
        best[i + span] = score
        backLength[i + span] = span
        backId[i + span] = id
      }
    }
    if (!single) {
      const score = Math.fround(from + unkScore)
      if (score > (best[i + 1] ?? -Infinity)) {
        best[i + 1] = score
        backLength[i + 1] = 1
        backId[i + 1] = tokenizer.unkId
      }
    }
  }

  const reversedIds: number[] = []
  const reversedOffsets: number[] = []
  let pos = length
  while (pos > 0) {
    const span = backLength[pos] ?? 0
    if (span <= 0) {
      throw new Error(`unigram encoding has no path through position ${pos}`)
    }
    pos -= span
    reversedIds.push(backId[pos + span] ?? tokenizer.unkId)
    reversedOffsets.push(pos)
  }

  const ids = Int32Array.from(reversedIds.reverse())
  const offsets = new Int32Array(ids.length + 1)
  offsets.set(reversedOffsets.reverse())
  offsets[ids.length] = length
  return { ids, offsets }
}

export function unigramText(words: string[]): string {
  return WORD_BOUNDARY + words.join(WORD_BOUNDARY)
}
