import { existsSync } from "node:fs"

import { Converter } from "ffmpeg-stream"

import { getAudioDuration } from "../audio/AudioConverter.ts"
import { type AudioFormat } from "../audio/AudioFormat.ts"
import {
  type AudioSource,
  type RawAudioInput,
  isAudioSource,
  normalizeToAudioSource,
  toFilePath,
  toReadStream,
} from "../audio/AudioSource.ts"
import { type Timing } from "../utilities/Timing.ts"

import {
  type CtcRunOptions,
  type LoadedCtcModel,
  loadCtcModel,
  resolveCtcRun,
} from "./CtcModel.ts"
import { type EmissionTokenizer, type Emissions } from "./Emissions.ts"

const SAMPLE_RATE = 16000

export interface CtcOptions extends CtcRunOptions {
  modelDir?: string | undefined
  autoInstall?: boolean | undefined
  inputFormat?: AudioFormat | undefined
  /**
   * Preloaded model instance
   * Do check it's the right one!
   */
  loaded?: LoadedCtcModel | null | undefined
  printOutput?: boolean | undefined
  samples?: (() => Promise<Float32Array>) | undefined
  onStart?: (() => void) | undefined
  onCheckpoint?: ((emissions: Emissions) => void) | undefined
  onProgress?: ((progress: number) => void) | undefined
}

export async function emit(
  input: RawAudioInput | AudioSource,
  timing: Timing,
  options: CtcOptions,
  signal?: AbortSignal | null,
): Promise<CtcResult> {
  const source = isAudioSource(input)
    ? input
    : normalizeToAudioSource(input, options.inputFormat)

  const inputPath = toFilePath(source)
  if (inputPath && !existsSync(inputPath)) {
    throw new Error(`Input file does not exist: ${inputPath}`)
  }

  const readSamples = options.samples
  timing.setMetadata("conversionRequired", readSamples === undefined)
  timing.setMetadata("targetFormat", "f32le")
  const audio = await timing.timeAsync("conversion", () =>
    readSamples === undefined ? readAudioAsFloat32(source) : readSamples(),
  )

  let audioLength: number | undefined
  if (source.type === "file") {
    const duration = await getAudioDuration(source.path)
    audioLength = duration
    timing.setMetadata("audioLength", duration)
  }

  if (signal?.aborted) {
    throw signal.reason
  }

  const model =
    options.loaded ??
    (await loadCtcModel(resolveCtcRun(options), {
      modelDir: options.modelDir,
      autoInstall: options.autoInstall,
      printOutput: options.printOutput,
      timing,
      signal,
    }))

  try {
    timing.setMetadata("device", model.run.device)
    timing.setMetadata("model", model.run.variant)
    timing.setMetadata("dtype", model.dtype)
    timing.setMetadata("batchSize", model.run.batchSize)

    options.onStart?.()

    const start = performance.now()
    const result = await timing.timeAsync("transcription", () =>
      computeEmissions(model, audio, options, signal),
    )
    const end = performance.now()

    if (audioLength) {
      timing.setMetadata("x Realtime", (audioLength * 1000) / (end - start))
    }

    return result
  } finally {
    if (model !== options.loaded) await model[Symbol.asyncDispose]()
  }
}

export async function emitChunks(
  model: LoadedCtcModel,
  chunks: Float32Array[],
  signal: AbortSignal | null,
): Promise<Emissions[]> {
  const emissions: Emissions[] = []
  for (let start = 0; start < chunks.length;) {
    const batch = chunks.slice(start, start + model.run.batchSize)
    const length = batch[0]?.length
    const shorter = batch.findIndex((chunk) => chunk.length !== length)
    if (shorter > 0) {
      batch.length = shorter
    }
    emissions.push(...(await model.compute(batch)))
    signal?.throwIfAborted()
    start += batch.length
  }
  return emissions
}

async function computeEmissions(
  model: LoadedCtcModel,
  audio: Float32Array,
  options: CtcOptions,
  signal: AbortSignal | null | undefined,
): Promise<CtcResult> {
  const chunkSamples = SAMPLE_RATE * model.run.chunkSeconds

  const chunks: Float32Array[] = []
  for (let i = 0; i < audio.length; i += chunkSamples) {
    const chunk = audio.subarray(i, i + chunkSamples)

    // Skip audio with too few samples to fill one frame, which causes
    // a crash
    if (chunk.length < model.minSamples) {
      continue
    }
    chunks.push(chunk)
  }

  let values: Float32Array | null = null
  let classes = 0
  let written = 0
  let totalFrames = 0
  let framesPerChunk: null | number = null
  let secondsPerChunk: null | number = null

  for (let start = 0; start < chunks.length;) {
    const batch = chunks.slice(start, start + model.run.batchSize)
    const length = batch[0]?.length
    const sameLength = batch.findIndex((chunk) => chunk.length !== length)
    if (sameLength > 0) batch.length = sameLength

    const results = await model.compute(batch)

    if (signal?.aborted) {
      throw signal.reason
    }

    for (const [index, logits] of results.entries()) {
      if (values === null) {
        classes = logits.classes
        values = new Float32Array(chunks.length * logits.frames * classes)
      }

      values.set(logits.values.subarray(0, logits.frames * classes), written)
      written += logits.frames * classes
      totalFrames += logits.frames

      framesPerChunk ??= logits.frames
      secondsPerChunk ??= (batch[index] as Float32Array).length / SAMPLE_RATE
    }

    start += batch.length

    options.onCheckpoint?.({
      values: values?.subarray(0, written) ?? new Float32Array(0),
      frames: totalFrames,
      classes,
    })

    options.onProgress?.(start / chunks.length)
  }

  if (!framesPerChunk || !secondsPerChunk) {
    throw new Error("Failed to process empty audio source")
  }

  const emissions: Emissions = {
    values: values?.subarray(0, written) ?? new Float32Array(0),
    frames: totalFrames,
    classes,
  }

  return {
    emissions,
    numFrames: emissions.frames,
    vocab: model.vocab,
    blankIndex: model.blankIndex,
    secondsPerChunk,
    framesPerChunk,
    secondsPerFrame: model.samplesPerFrame / SAMPLE_RATE,
    startOffsetSeconds: model.startOffsetSeconds,
    endOffsetSeconds: model.endOffsetSeconds,
    tokenizer: model.tokenizer,
  }
}

/**
 * Reads audio from an AudioSource and converts it to a Float32Array
 * of mono, 16kHz PCM samples in the range [-1, 1].
 *
 * This is what the CTC models expect
 */
export async function readAudioAsFloat32(
  source: AudioSource,
): Promise<Float32Array> {
  const converter = new Converter()
  const inputPath = toFilePath(source)

  if (inputPath) {
    converter.createInputFromFile(inputPath)
  } else {
    const readable = toReadStream(source)
    const inputStream = converter.createInputStream({})
    readable.pipe(inputStream)
  }

  // Output raw 32-bit float PCM, mono, 16kHz
  const outputStream = converter.createOutputStream({
    f: "f32le",
    ar: "16000",
    ac: "1",
  })

  const chunks: Buffer[] = []
  outputStream.on("data", (chunk: Buffer) => chunks.push(chunk))

  const bufferPromise = new Promise<Buffer>((resolve, reject) => {
    outputStream.on("end", () => {
      resolve(Buffer.concat(chunks))
    })
    outputStream.on("error", reject)
  })

  await converter.run()
  const buffer = await bufferPromise

  // Convert Buffer to Float32Array
  // Each float is 4 bytes, so the number of samples = buffer.length / 4
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4)
}

export interface CtcResult {
  emissions: Emissions
  numFrames: number
  vocab: Map<string, number>
  blankIndex: number
  secondsPerChunk: number
  framesPerChunk: number
  secondsPerFrame: number
  startOffsetSeconds: number
  endOffsetSeconds: number
  tokenizer: EmissionTokenizer | null
}
