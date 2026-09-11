import { type EmissionResult } from "../api/Emission.ts"

import { type EmissionTokenizer } from "./Emissions.ts"

export type EmissionData = Omit<EmissionResult, "timing">

const MAGIC_WORD = "STEM"

const VERSION = 2

const ENCODINGS = { dense: 1, sparse: 2 } as const

const SPARSE_TOP_K = 16

const SPARSE_MIN_CLASSES = 128

const TOKENIZERS = { none: 0, unigram: 1 } as const

const OFFSETS = {
  magic: 0,
  version: 4,
  encoding: 6,
  vocabSize: 8,
  numFrames: 12,
  blankIndex: 16,
  secondsPerChunk: 20,
  framesPerChunk: 28,
  secondsPerFrame: 32,
  framesOffset: 40,
  frameOffsetSeconds: 44,
  tokenizer: 52,
  topK: 54,
  unkId: 56,
  vocab: 60,
}

const VERSION_1_VOCAB_OFFSET = 44

export function encodeEmissions(data: EmissionData): [Uint8Array, Uint8Array] {
  const vocabSize = data.vocab.size
  const { values, frames, classes } = data.emissions

  if (classes !== vocabSize) {
    throw new Error(
      `Failed to encode emissions; vectors had length ${classes}; expected ${vocabSize} from vocab size`,
    )
  }

  const length = frames * vocabSize
  if (values.length < length) {
    throw new Error(
      `Failed to encode emissions; buffer holds ${values.length} values; expected at least ${length} for ${frames} frames`,
    )
  }

  if (data.tokenizer && data.tokenizer.scores.length !== vocabSize) {
    throw new Error(
      `Failed to encode emissions; tokenizer has ${data.tokenizer.scores.length} scores; expected ${vocabSize} from vocab size`,
    )
  }

  const topK = vocabSize > SPARSE_MIN_CLASSES ? SPARSE_TOP_K : 0
  const emissions =
    topK > 0
      ? encodeSparseFrames(values, frames, classes, topK)
      : encodeDenseFrames(values, length)

  const encoder = new TextEncoder()
  const vocabEntries = Array.from(data.vocab.entries()).toSorted(
    (a, b) => a[1] - b[1],
  )

  let vocabBytes = 0
  const encoded: { bytes: Uint8Array; index: number }[] = []
  for (const [token, index] of vocabEntries) {
    const bytes = encoder.encode(token)
    if (bytes.length > 65535) {
      throw new Error(
        `encodeEmission: token ${JSON.stringify(token)} exceeds 65535 bytes`,
      )
    }

    encoded.push({ bytes, index })
    vocabBytes += 6 + bytes.length
  }

  const paddedVocabBytes = Math.ceil(vocabBytes / 4) * 4
  const scoresOffset = OFFSETS.vocab + paddedVocabBytes
  const framesOffset = scoresOffset + (data.tokenizer ? vocabSize * 4 : 0)

  const head = new Uint8Array(framesOffset)
  const view = new DataView(head.buffer)

  head.set(encoder.encode(MAGIC_WORD), OFFSETS.magic)
  view.setUint16(OFFSETS.version, VERSION, true)
  view.setUint16(
    OFFSETS.encoding,
    topK > 0 ? ENCODINGS.sparse : ENCODINGS.dense,
    true,
  )
  view.setUint32(OFFSETS.vocabSize, vocabSize, true)
  view.setUint32(OFFSETS.numFrames, frames, true)
  view.setUint32(OFFSETS.blankIndex, data.blankIndex, true)
  view.setFloat64(OFFSETS.secondsPerChunk, data.secondsPerChunk, true)
  view.setUint32(OFFSETS.framesPerChunk, data.framesPerChunk, true)
  view.setFloat64(OFFSETS.secondsPerFrame, data.secondsPerFrame, true)
  view.setUint32(OFFSETS.framesOffset, framesOffset, true)
  view.setFloat64(OFFSETS.frameOffsetSeconds, data.frameOffsetSeconds, true)
  view.setUint16(
    OFFSETS.tokenizer,
    data.tokenizer ? TOKENIZERS[data.tokenizer.kind] : TOKENIZERS.none,
    true,
  )
  view.setUint16(OFFSETS.topK, topK, true)
  view.setUint32(OFFSETS.unkId, data.tokenizer?.unkId ?? 0, true)

  let o = OFFSETS.vocab
  for (const { bytes, index } of encoded) {
    view.setUint32(o, index, true)
    view.setUint16(o + 4, bytes.length, true)
    head.set(bytes, o + 6)
    o += 6 + bytes.length
  }

  if (data.tokenizer) {
    for (const [index, score] of data.tokenizer.scores.entries()) {
      view.setFloat32(scoresOffset + index * 4, score, true)
    }
  }

  return [head, emissions]
}

function encodeDenseFrames(values: Float32Array, length: number) {
  const floats = new Float16Array(length)
  floats.set(values.subarray(0, length))
  return new Uint8Array(floats.buffer, floats.byteOffset, floats.byteLength)
}

function encodeSparseFrames(
  values: Float32Array,
  frames: number,
  classes: number,
  topK: number,
) {
  const bytes = new Uint8Array(frames * topK * 4)
  const view = new DataView(bytes.buffer)
  const indices = new Int32Array(topK)
  const scores = new Float32Array(topK)
  for (let frame = 0; frame < frames; frame++) {
    const row = frame * classes
    let kept = 0
    for (let c = 0; c < classes; c++) {
      const value = values[row + c] ?? -Infinity
      if (kept === topK && value <= (scores[kept - 1] ?? -Infinity)) continue
      let i = kept < topK ? kept : topK - 1
      while (i > 0 && (scores[i - 1] ?? -Infinity) < value) {
        scores[i] = scores[i - 1] ?? -Infinity
        indices[i] = indices[i - 1] ?? 0
        i--
      }
      scores[i] = value
      indices[i] = c
      if (kept < topK) kept++
    }
    const base = frame * topK * 4
    for (let i = 0; i < topK; i++) {
      view.setUint16(base + i * 2, indices[i] ?? 0, true)
      view.setFloat16(base + topK * 2 + i * 2, scores[i] ?? -Infinity, true)
    }
  }
  return bytes
}

function decodeSparseFrames(
  bytes: Uint8Array,
  classes: number,
  topK: number,
): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const frames = Math.floor(bytes.byteLength / (topK * 4))
  const values = new Float32Array(frames * classes)
  for (let frame = 0; frame < frames; frame++) {
    const base = frame * topK * 4
    const row = frame * classes
    const floor = view.getFloat16(base + topK * 2 + (topK - 1) * 2, true)
    values.fill(floor, row, row + classes)
    for (let i = 0; i < topK; i++) {
      values[row + view.getUint16(base + i * 2, true)] = view.getFloat16(
        base + topK * 2 + i * 2,
        true,
      )
    }
  }
  return values
}

export async function decodeEmissions(
  getBytes: (from: number, to: number) => Promise<Uint8Array>,
  from?: number,
  to?: number,
): Promise<EmissionData> {
  const head = await getBytes(OFFSETS.magic, VERSION_1_VOCAB_OFFSET)

  const view = new DataView(head.buffer)

  const decoder = new TextDecoder()
  const magicBytes = head.slice(OFFSETS.magic, OFFSETS.version)
  const magicWord = decoder.decode(magicBytes)

  if (magicWord !== MAGIC_WORD) {
    throw new Error(
      `Failed to decode emissions. Magic bytes decoded to ${magicWord}; expected ${MAGIC_WORD}`,
    )
  }

  const version = view.getUint16(OFFSETS.version, true)
  if (version !== 1 && version !== VERSION) {
    throw new Error(
      `Failed to decode emissions. Found version ${version}; expected ${VERSION}`,
    )
  }

  const encoding = view.getUint16(OFFSETS.encoding, true)
  if (encoding !== ENCODINGS.dense && encoding !== ENCODINGS.sparse) {
    throw new Error(
      `Failed to decode emissions. Found encoding ${encoding}; expected one of ${Object.values(ENCODINGS).join(", ")}`,
    )
  }

  const vocabSize = view.getUint32(OFFSETS.vocabSize, true)
  const numFrames = view.getUint32(OFFSETS.numFrames, true)
  const blankIndex = view.getUint32(OFFSETS.blankIndex, true)
  const secondsPerChunk = view.getFloat64(OFFSETS.secondsPerChunk, true)
  const framesPerChunk = view.getUint32(OFFSETS.framesPerChunk, true)
  const secondsPerFrame = view.getFloat64(OFFSETS.secondsPerFrame, true)
  const framesOffset = view.getUint32(OFFSETS.framesOffset, true)

  let frameOffsetSeconds = 0
  let tokenizerKind: number = TOKENIZERS.none
  let topK = 0
  let unkId = 0
  let vocabOffset = VERSION_1_VOCAB_OFFSET
  if (version === VERSION) {
    const extra = await getBytes(OFFSETS.frameOffsetSeconds, OFFSETS.vocab)
    const extraView = new DataView(
      extra.buffer,
      extra.byteOffset,
      extra.byteLength,
    )
    frameOffsetSeconds = extraView.getFloat64(0, true)
    tokenizerKind = extraView.getUint16(
      OFFSETS.tokenizer - OFFSETS.frameOffsetSeconds,
      true,
    )
    topK = extraView.getUint16(OFFSETS.topK - OFFSETS.frameOffsetSeconds, true)
    unkId = extraView.getUint32(OFFSETS.unkId - OFFSETS.frameOffsetSeconds, true)
    vocabOffset = OFFSETS.vocab
  }

  if (encoding === ENCODINGS.sparse && topK === 0) {
    throw new Error("Failed to decode emissions. Sparse encoding without a top-k")
  }

  const scoresOffset =
    tokenizerKind === TOKENIZERS.none
      ? framesOffset
      : framesOffset - vocabSize * 4

  const vocabData = await getBytes(vocabOffset, scoresOffset)
  const vocabView = new DataView(vocabData.buffer)

  const vocab = new Map<string, number>()
  let o = 0
  while (o < vocabData.length - 4) {
    const index = vocabView.getUint32(o, true)
    const length = vocabView.getUint16(o + 4, true)
    const bytes = vocabData.slice(o + 6, o + 6 + length)
    const token = decoder.decode(bytes)
    vocab.set(token, index)
    o += 6 + length
  }

  if (vocab.size !== vocabSize) {
    throw new Error(
      `Failed to decode emissions. Found vocab with size ${vocab.size}; expected ${vocabSize}`,
    )
  }

  let tokenizer: EmissionTokenizer | null = null
  if (tokenizerKind === TOKENIZERS.unigram) {
    const scoresData = await getBytes(scoresOffset, framesOffset)
    const scoresView = new DataView(
      scoresData.buffer,
      scoresData.byteOffset,
      scoresData.byteLength,
    )
    const scores = new Float32Array(vocabSize)
    for (let i = 0; i < vocabSize; i++) {
      scores[i] = scoresView.getFloat32(i * 4, true)
    }
    tokenizer = { kind: "unigram", scores, unkId }
  } else if (tokenizerKind !== TOKENIZERS.none) {
    throw new Error(
      `Failed to decode emissions. Found tokenizer ${tokenizerKind}; expected one of ${Object.values(TOKENIZERS).join(", ")}`,
    )
  }

  const framesFrom = from ?? 0
  const framesTo = to ?? numFrames

  const bytesPerFrame = encoding === ENCODINGS.sparse ? topK * 4 : vocabSize * 2
  const framesData = await getBytes(
    framesOffset + framesFrom * bytesPerFrame,
    framesOffset + framesTo * bytesPerFrame,
  )

  let values: Float32Array
  if (encoding === ENCODINGS.sparse) {
    values = decodeSparseFrames(framesData, vocabSize, topK)
  } else {
    const framesView = new DataView(
      framesData.buffer,
      framesData.byteOffset,
      framesData.byteLength,
    )
    const count = Math.floor(framesData.byteLength / 2 / vocabSize) * vocabSize
    values = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      values[i] = framesView.getFloat16(i * 2, true)
    }
  }

  return {
    emissions: {
      values,
      frames: values.length / vocabSize,
      classes: vocabSize,
    },
    blankIndex,
    secondsPerChunk,
    secondsPerFrame,
    framesPerChunk,
    frameOffsetSeconds,
    tokenizer,
    numFrames,
    vocab,
  }
}
