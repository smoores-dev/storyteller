import { existsSync } from "fs"

import {
  type DataType,
  type DeviceType,
  type Tensor,
  Wav2Vec2CTCTokenizer,
  Wav2Vec2FeatureExtractor,
  Wav2Vec2ForCTC,
  log_softmax,
} from "@huggingface/transformers"
import { Converter } from "ffmpeg-stream"
import { ensureDir } from "fs-extra"

import { prepareWavForService } from "../audio/AudioConverter.ts"
import { type AudioFormat } from "../audio/AudioFormat.ts"
import {
  type AudioSource,
  type RawAudioInput,
  isAudioSource,
  normalizeToAudioSource,
  toFilePath,
  toReadStream,
} from "../audio/AudioSource.ts"
import { getModelDir } from "../cli/config.ts"
import { type Language, type Wav2Vec2Model } from "../constants.ts"
import { type Timing } from "../utilities/Timing.ts"

declare module "@huggingface/transformers" {
  export interface PretrainedConfig {
    conv_stride?: number[]
    conv_kernel?: number[]
  }
}

export type { Wav2Vec2Model }

export interface Wav2Vec2Options {
  model: Wav2Vec2Model
  modelDir?: string
  device?: DeviceType
  dtype?: DataType
  autoInstall?: boolean
  language?: Language
  inputFormat?: AudioFormat
  printOutput?: boolean
  onStart?: () => void
  onCheckpoint?: (emissions: number[][]) => void
  onProgress?: (progress: number) => void
}

const defaultOptions: Required<
  Pick<Wav2Vec2Options, "autoInstall" | "device" | "dtype" | "printOutput">
> = {
  autoInstall: true,
  device: "auto",
  dtype: "fp32",
  printOutput: false,
}

export async function emit(
  input: RawAudioInput | AudioSource,
  timing: Timing,
  options: Wav2Vec2Options,
  signal?: AbortSignal | null,
): Promise<Wav2Vec2Result> {
  const opts = { ...defaultOptions, ...options }
  const modelDir = opts.modelDir ?? getModelDir()

  await ensureDir(modelDir)

  const source = isAudioSource(input)
    ? input
    : normalizeToAudioSource(input, opts.inputFormat)

  const conversionNeeded = source.format !== "wav"
  timing.setMetadata("conversionRequired", conversionNeeded)
  timing.setMetadata("targetFormat", conversionNeeded ? "wav" : source.format)

  async function doPrepare() {
    if (!conversionNeeded) {
      return { source, [Symbol.asyncDispose]: async () => {} }
    }
    return prepareWavForService(source, { sampleRate: 16000, channels: 1 })
  }

  await using prepared = await timing.timeAsync("conversion", doPrepare)

  const inputPath = toFilePath(prepared.source)
  if (!inputPath) {
    throw new Error(
      "wav2vec2 requires a file path. The audio could not be prepared as a file.",
    )
  }

  if (!existsSync(inputPath)) {
    throw new Error(`Input file does not exist: ${inputPath}`)
  }

  opts.onStart?.()
  const {
    emissions,
    vocab,
    blankIndex,
    framesPerChunk,
    secondsPerChunk,
    secondsPerFrame,
  } = await timing.timeAsync("transcription", async () => {
    const model = await Wav2Vec2ForCTC.from_pretrained(opts.model, {
      cache_dir: modelDir,
      device: opts.device,
      dtype: opts.dtype,
    })

    if (signal?.aborted) {
      throw signal.reason
    }

    const tokenizer = await Wav2Vec2CTCTokenizer.from_pretrained(opts.model, {
      cache_dir: modelDir,
    })

    if (signal?.aborted) {
      throw signal.reason
    }

    const featureExtractor = await Wav2Vec2FeatureExtractor.from_pretrained(
      opts.model,
      { cache_dir: modelDir },
    )

    if (signal?.aborted) {
      throw signal.reason
    }

    const audio = await readAudioAsFloat32(prepared.source)

    if (signal?.aborted) {
      throw signal.reason
    }

    const SAMPLE_RATE = 16000

    const SECONDS_PER_CHUNK = 25
    const CHUNK_SIZE_SAMPLES = SAMPLE_RATE * SECONDS_PER_CHUNK

    const strides = model.config.conv_stride

    if (strides === undefined) {
      throw new Error(
        `Failed to read conv_stride from model config for model ${opts.model}`,
      )
    }

    const kernels = model.config.conv_kernel
    if (kernels === undefined) {
      throw new Error(
        `Failed to read conv_kernel from model config for model ${opts.model}`,
      )
    }

    let minChunkSamples = 1
    let jump = 1
    for (let i = 0; i < kernels.length; i++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      minChunkSamples += (kernels[i]! - 1) * jump
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      jump *= strides[i]!
    }

    const emissions: number[][] = []
    let framesPerChunk: null | number = null
    let secondsPerChunk: null | number = null

    for (let i = 0; i < audio.length; i += CHUNK_SIZE_SAMPLES) {
      const chunk = audio.slice(i, i + CHUNK_SIZE_SAMPLES)

      // Skip audio with too few samples to fill one frame, which causes
      // a crash
      if (chunk.length < minChunkSamples) continue

      const inputs = (await featureExtractor(chunk)) as unknown

      if (signal?.aborted) {
        throw signal.reason
      }

      const output = (await model.forward(inputs)) as { logits: Tensor }

      if (signal?.aborted) {
        throw signal.reason
      }

      const logits = output.logits.tolist() as [number[][]]

      if (signal?.aborted) {
        throw signal.reason
      }

      const logProbs = logits[0].map((frame) => log_softmax(frame))
      emissions.push(...logProbs)

      framesPerChunk ??= logProbs.length
      secondsPerChunk ??= chunk.length / SAMPLE_RATE

      opts.onCheckpoint?.(emissions)

      opts.onProgress?.(i / audio.length)
    }

    const stride = strides.reduce((a, b) => a * b, 1)
    const secondsPerFrame = stride / SAMPLE_RATE

    const vocab = tokenizer.get_vocab()
    const blankIndex = vocab.get("<blank>") ?? tokenizer.pad_token_id

    if (!framesPerChunk || !secondsPerChunk) {
      throw new Error("Failed to process empty audio source")
    }

    return {
      emissions,
      vocab,
      blankIndex,
      secondsPerChunk,
      framesPerChunk,
      secondsPerFrame,
    }
  })

  return {
    emissions,
    numFrames: emissions.length,
    vocab,
    blankIndex,
    secondsPerChunk,
    framesPerChunk,
    secondsPerFrame,
  }
}

/**
 * Reads audio from an AudioSource and converts it to a Float32Array
 * of mono, 16kHz PCM samples in the range [-1, 1].
 *
 * This is what Wav2Vec2's feature extractor expects.
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

export interface Wav2Vec2Result {
  emissions: number[][]
  numFrames: number
  vocab: Map<string, number>
  blankIndex: number
  secondsPerChunk: number
  framesPerChunk: number
  secondsPerFrame: number
}
