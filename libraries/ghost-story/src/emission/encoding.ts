import { type EmissionResult } from "../api/Emission.ts"

export type EmissionData = Omit<EmissionResult, "timing">

const MAGIC_WORD = "STEM"

const VERSION = 1

const ENCODING = 1 // fp32

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
  vocab: 44,
}

export function encodeEmissions(data: EmissionData): [Uint8Array, Uint8Array] {
  const vocabSize = data.vocab.size
  for (let i = 0; i < data.emissions.length; i++) {
    const e = data.emissions[i]
    if (e?.length === vocabSize) continue

    throw new Error(
      `Failed to encode emissions; vector at index ${i} had length ${e?.length}; expected ${vocabSize} from vocab size`,
    )
  }

  const emissionsFloats = new Float16Array(data.emissions.length * vocabSize)
  for (let i = 0; i < data.emissions.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const e = data.emissions[i]!

    if (e.length !== vocabSize) {
      throw new Error(
        `Failed to encode emissions; vector at index ${i} had length ${e.length}; expected ${vocabSize} from vocab size`,
      )
    }

    emissionsFloats.set(e, i * vocabSize)
  }
  const emissions = new Uint8Array(
    emissionsFloats.buffer,
    emissionsFloats.byteOffset,
    emissionsFloats.byteLength,
  )

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
  const framesOffset = OFFSETS.vocab + paddedVocabBytes

  const head = new Uint8Array(framesOffset)
  const view = new DataView(head.buffer)

  head.set(encoder.encode(MAGIC_WORD), OFFSETS.magic)
  view.setUint16(OFFSETS.version, VERSION, true)
  view.setUint16(OFFSETS.encoding, ENCODING, true)
  view.setUint32(OFFSETS.vocabSize, vocabSize, true)
  view.setUint32(OFFSETS.numFrames, data.emissions.length, true)
  view.setUint32(OFFSETS.blankIndex, data.blankIndex, true)
  view.setFloat64(OFFSETS.secondsPerChunk, data.secondsPerChunk, true)
  view.setUint32(OFFSETS.framesPerChunk, data.framesPerChunk, true)
  view.setFloat64(OFFSETS.secondsPerFrame, data.secondsPerFrame, true)
  view.setUint32(OFFSETS.framesOffset, framesOffset, true)

  let o = OFFSETS.vocab
  for (const { bytes, index } of encoded) {
    view.setUint32(o, index, true)
    view.setUint16(o + 4, bytes.length, true)
    head.set(bytes, o + 6)
    o += 6 + bytes.length
  }

  return [head, emissions]
}

export async function decodeEmissions(
  getBytes: (from: number, to: number) => Promise<Uint8Array>,
  from?: number,
  to?: number,
): Promise<EmissionData> {
  const head = await getBytes(OFFSETS.magic, OFFSETS.vocab)

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
  if (version !== VERSION) {
    throw new Error(
      `Failed to decode emissions. Found version ${version}; expected ${VERSION}`,
    )
  }

  const encoding = view.getUint16(OFFSETS.encoding, true)
  if (encoding !== ENCODING) {
    throw new Error(
      `Failed to decode emissions. Found encoding ${encoding}; expected ${ENCODING}`,
    )
  }

  const vocabSize = view.getUint32(OFFSETS.vocabSize, true)
  const numFrames = view.getUint32(OFFSETS.numFrames, true)
  const blankIndex = view.getUint32(OFFSETS.blankIndex, true)
  const secondsPerChunk = view.getFloat64(OFFSETS.secondsPerChunk, true)
  const framesPerChunk = view.getUint32(OFFSETS.framesPerChunk, true)
  const secondsPerFrame = view.getFloat64(OFFSETS.secondsPerFrame, true)
  const framesOffset = view.getUint32(OFFSETS.framesOffset, true)

  const vocabData = await getBytes(OFFSETS.vocab, framesOffset)
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

  const framesFrom = from ?? 0
  const framesTo = to ?? numFrames

  const framesData = await getBytes(
    framesOffset + framesFrom * vocabSize * 2,
    framesOffset + framesTo * vocabSize * 2,
  )

  const framesView = new DataView(framesData.buffer)

  const rowLength = vocabSize * 2
  const frames: number[][] = []
  for (let i = 0; i < framesData.length; i += rowLength) {
    const frame: number[] = []
    for (let j = 0; j < vocabSize; j++) {
      frame.push(framesView.getFloat16(i + j * 2, true))
    }
    frames.push(frame)
  }

  return {
    emissions: frames,
    blankIndex,
    secondsPerChunk,
    secondsPerFrame,
    framesPerChunk,
    numFrames,
    vocab,
  }
}
