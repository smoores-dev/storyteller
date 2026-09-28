import { type EmissionResult } from "../api/Emission.ts"

import { type EmissionTokenizer, type Emissions } from "./Emissions.ts"

export type EmissionData = Omit<EmissionResult, "timing">

export type GetBytes = (from: number, to: number) => Promise<Uint8Array>

const MAGIC_WORD = "STEM"

const VERSION = 3

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
  startOffsetSeconds: 44,
  endOffsetSeconds: 48,
  tokenizer: 52,
  topK: 54,
  unkId: 56,
  vocab: 60,
}

const VERSION_1_VOCAB_OFFSET = 44

const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1

export interface EmissionsMeta {
  vocab: Map<string, number>
  blankIndex: number
  classes: number
  secondsPerChunk: number
  framesPerChunk: number
  secondsPerFrame: number
  startOffsetSeconds: number
  endOffsetSeconds: number
  tokenizer: EmissionTokenizer | null
}

export interface EmissionsFileHeader extends EmissionsMeta {
  version: number
  numFrames: number
  encoding: keyof typeof ENCODINGS
  topK: number
  framesOffset: number
  bytesPerFrame: number
}

export function encodeEmissions(data: EmissionData): [Uint8Array, Uint8Array] {
  const { classes, frames } = data.emissions
  return [
    encodeEmissionsHeader({ ...data, classes }, frames),
    encodeEmissionsFrames(data.emissions),
  ]
}

export function encodeEmissionsFrames({
  values,
  frames,
  classes,
}: Emissions): Uint8Array {
  const length = frames * classes
  if (values.length < length) {
    throw new Error(
      `Failed to encode emissions; buffer holds ${values.length} values; expected at least ${length} for ${frames} frames`,
    )
  }
  return classes > SPARSE_MIN_CLASSES
    ? encodeSparseFrames(values, frames, classes, SPARSE_TOP_K)
    : encodeDenseFrames(values, length)
}

export function encodeEmissionsHeader(
  data: EmissionsMeta,
  frames: number,
): Uint8Array {
  const vocabSize = data.vocab.size

  if (data.classes !== vocabSize) {
    throw new Error(
      `Failed to encode emissions; vectors had length ${data.classes}; expected ${vocabSize} from vocab size`,
    )
  }

  if (data.tokenizer && data.tokenizer.scores.length !== vocabSize) {
    throw new Error(
      `Failed to encode emissions; tokenizer has ${data.tokenizer.scores.length} scores; expected ${vocabSize} from vocab size`,
    )
  }

  const topK = vocabSize > SPARSE_MIN_CLASSES ? SPARSE_TOP_K : 0

  if (topK > 0 && vocabSize > 65536) {
    throw new Error(
      `Failed to encode emissions; sparse frames store class indices as uint16; vocab has ${vocabSize} entries`,
    )
  }

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
        `Failed to encode emissions; token ${JSON.stringify(token)} exceeds 65535 bytes`,
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
  view.setFloat32(OFFSETS.startOffsetSeconds, data.startOffsetSeconds, true)
  view.setFloat32(OFFSETS.endOffsetSeconds, data.endOffsetSeconds, true)
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
    for (let index = 0; index < vocabSize; index++) {
      view.setFloat32(
        scoresOffset + index * 4,
        data.tokenizer.scores[index] ?? 0,
        true,
      )
    }
  }

  return head
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
      if (kept === topK && value <= (scores[kept - 1] ?? -Infinity)) {
        continue
      }
      let i = kept < topK ? kept : topK - 1
      while (i > 0 && (scores[i - 1] ?? -Infinity) < value) {
        scores[i] = scores[i - 1] ?? -Infinity
        indices[i] = indices[i - 1] ?? 0
        i--
      }
      scores[i] = value
      indices[i] = c
      if (kept < topK) {
        kept++
      }
    }
    const base = frame * topK * 4
    for (let i = 0; i < topK; i++) {
      view.setUint16(base + i * 2, indices[i] ?? 0, true)
      view.setFloat16(base + topK * 2 + i * 2, scores[i] ?? -Infinity, true)
    }
  }
  return bytes
}

function viewOf(bytes: Uint8Array) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

export async function decodeEmissionsHeader(
  getBytes: GetBytes,
): Promise<EmissionsFileHeader> {
  const head = await getBytes(OFFSETS.magic, VERSION_1_VOCAB_OFFSET)
  const view = viewOf(head)

  const decoder = new TextDecoder()
  const magicWord = decoder.decode(
    head.subarray(OFFSETS.magic, OFFSETS.version),
  )

  if (magicWord !== MAGIC_WORD) {
    throw new Error(
      `Failed to decode emissions. Magic bytes decoded to ${magicWord}; expected ${MAGIC_WORD}`,
    )
  }

  const version = view.getUint16(OFFSETS.version, true)
  if (version !== 1 && version !== 2 && version !== VERSION) {
    throw new Error(
      `Failed to decode emissions. Found version ${version}; expected ${VERSION}`,
    )
  }

  const encodingId = view.getUint16(OFFSETS.encoding, true)
  if (encodingId !== ENCODINGS.dense && encodingId !== ENCODINGS.sparse) {
    throw new Error(
      `Failed to decode emissions. Found encoding ${encodingId}; expected one of ${Object.values(ENCODINGS).join(", ")}`,
    )
  }
  const encoding = encodingId === ENCODINGS.sparse ? "sparse" : "dense"

  const vocabSize = view.getUint32(OFFSETS.vocabSize, true)
  const numFrames = view.getUint32(OFFSETS.numFrames, true)
  const blankIndex = view.getUint32(OFFSETS.blankIndex, true)
  const secondsPerChunk = view.getFloat64(OFFSETS.secondsPerChunk, true)
  const framesPerChunk = view.getUint32(OFFSETS.framesPerChunk, true)
  const secondsPerFrame = view.getFloat64(OFFSETS.secondsPerFrame, true)
  const framesOffset = view.getUint32(OFFSETS.framesOffset, true)

  let startOffsetSeconds = 0
  let endOffsetSeconds = 0
  let tokenizerKind: number = TOKENIZERS.none
  let topK = 0
  let unkId = 0
  let vocabOffset = VERSION_1_VOCAB_OFFSET
  if (version >= 2) {
    const base = OFFSETS.startOffsetSeconds
    const extra = viewOf(await getBytes(base, OFFSETS.vocab))
    if (version === 2) {
      startOffsetSeconds = extra.getFloat64(0, true)
      endOffsetSeconds = startOffsetSeconds
    } else {
      startOffsetSeconds = extra.getFloat32(0, true)
      endOffsetSeconds = extra.getFloat32(OFFSETS.endOffsetSeconds - base, true)
    }
    tokenizerKind = extra.getUint16(OFFSETS.tokenizer - base, true)
    topK = extra.getUint16(OFFSETS.topK - base, true)
    unkId = extra.getUint32(OFFSETS.unkId - base, true)
    vocabOffset = OFFSETS.vocab
  }

  if (encoding === "sparse" && topK === 0) {
    throw new Error(
      "Failed to decode emissions. Sparse encoding without a top-k",
    )
  }

  const scoresOffset =
    tokenizerKind === TOKENIZERS.none
      ? framesOffset
      : framesOffset - vocabSize * 4

  const vocabData = await getBytes(vocabOffset, scoresOffset)
  const vocabView = viewOf(vocabData)

  const vocab = new Map<string, number>()
  let o = 0
  while (o < vocabData.length - 4) {
    const index = vocabView.getUint32(o, true)
    const length = vocabView.getUint16(o + 4, true)
    vocab.set(decoder.decode(vocabData.subarray(o + 6, o + 6 + length)), index)
    o += 6 + length
  }

  if (vocab.size !== vocabSize) {
    throw new Error(
      `Failed to decode emissions. Found vocab with size ${vocab.size}; expected ${vocabSize}`,
    )
  }

  let tokenizer: EmissionTokenizer | null = null
  if (tokenizerKind === TOKENIZERS.unigram) {
    const scoresView = viewOf(await getBytes(scoresOffset, framesOffset))
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

  return {
    vocab,
    classes: vocabSize,
    blankIndex,
    secondsPerChunk,
    framesPerChunk,
    secondsPerFrame,
    startOffsetSeconds,
    endOffsetSeconds,
    tokenizer,
    version,
    numFrames,
    encoding,
    topK,
    framesOffset,
    bytesPerFrame: encoding === "sparse" ? topK * 4 : vocabSize * 2,
  }
}

export function frameByteRange(
  header: EmissionsFileHeader,
  from = 0,
  to = header.numFrames,
): [number, number] {
  const first = Math.min(Math.max(from, 0), header.numFrames)
  const last = Math.min(Math.max(to, first), header.numFrames)
  return [
    header.framesOffset + first * header.bytesPerFrame,
    header.framesOffset + last * header.bytesPerFrame,
  ]
}

export function decodeEmissionsFrames(
  header: EmissionsFileHeader,
  bytes: Uint8Array,
): Emissions {
  const { classes, bytesPerFrame } = header
  if (bytesPerFrame === 0 || bytes.byteLength === 0) {
    return { values: new Float32Array(0), frames: 0, classes }
  }
  if (bytes.byteLength % bytesPerFrame !== 0) {
    throw new Error(
      `Failed to decode emissions. Got ${bytes.byteLength} bytes; expected a multiple of ${bytesPerFrame}`,
    )
  }

  const values =
    header.encoding === "sparse"
      ? decodeSparseFrames(bytes, classes, header.topK)
      : decodeDenseFrames(bytes)

  return { values, frames: bytes.byteLength / bytesPerFrame, classes }
}

function decodeDenseFrames(bytes: Uint8Array): Float32Array {
  const count = bytes.byteLength / 2
  if (LITTLE_ENDIAN && bytes.byteOffset % 2 === 0) {
    return new Float32Array(
      new Float16Array(bytes.buffer, bytes.byteOffset, count),
    )
  }
  const view = viewOf(bytes)
  const values = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    values[i] = view.getFloat16(i * 2, true)
  }
  return values
}

function decodeSparseFrames(
  bytes: Uint8Array,
  classes: number,
  topK: number,
): Float32Array {
  const view = viewOf(bytes)
  const frames = bytes.byteLength / (topK * 4)
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
  getBytes: GetBytes,
  from?: number,
  to?: number,
): Promise<EmissionData> {
  const header = await decodeEmissionsHeader(getBytes)
  const [start, end] = frameByteRange(header, from, to)
  const emissions = decodeEmissionsFrames(header, await getBytes(start, end))
  return {
    emissions,
    blankIndex: header.blankIndex,
    secondsPerChunk: header.secondsPerChunk,
    secondsPerFrame: header.secondsPerFrame,
    framesPerChunk: header.framesPerChunk,
    startOffsetSeconds: header.startOffsetSeconds,
    endOffsetSeconds: header.endOffsetSeconds,
    tokenizer: header.tokenizer,
    numFrames: header.numFrames,
    vocab: header.vocab,
  }
}
