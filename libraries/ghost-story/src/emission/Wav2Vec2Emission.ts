import { existsSync } from "node:fs"

import {
  type DataType,
  type DeviceType,
  type FeatureExtractor,
  type PreTrainedModel,
  type PreTrainedTokenizer,
  type Tensor,
  Wav2Vec2CTCTokenizer,
  Wav2Vec2FeatureExtractor,
  Wav2Vec2ForCTC,
  log_softmax,
} from "@huggingface/transformers"
import { Converter } from "ffmpeg-stream"
import { ensureDir } from "fs-extra"

import { type ModelInfo as MlxModelInfo } from "@storyteller-platform/mlx-audio"

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
import {
  getModelPackageDir,
  installModelPackage,
  isModelPackageInstalled,
} from "../cli/ctc-install.ts"
import {
  CTC_MODEL_PACKAGES,
  type CtcModel,
  type Language,
  type Wav2Vec2DataType,
  type Wav2Vec2Device,
} from "../constants.ts"
import { type Timing } from "../utilities/Timing.ts"

declare module "@huggingface/transformers" {
  export interface PretrainedConfig {
    conv_stride?: number[]
    conv_kernel?: number[]
  }
}

export interface Wav2Vec2Options {
  modelDir?: string
  device?: Wav2Vec2Device
  dtype?: Wav2Vec2DataType
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
  const variant: CtcModel = opts.device === "mlx" ? "mlx" : opts.dtype
  const ctcModel = CTC_MODEL_PACKAGES[variant]

  await ensureDir(modelDir)

  async function doInstall() {
    if (isModelPackageInstalled(ctcModel, modelDir)) {
      return
    }

    await installModelPackage(ctcModel, {
      modelDir,
      printOutput: opts.printOutput,
    })
  }

  if (opts.autoInstall) {
    await timing.timeAsync("installation", doInstall)
  } else if (!isModelPackageInstalled(ctcModel, modelDir)) {
    throw new Error(
      `${ctcModel.name} is not installed in ${getModelPackageDir(ctcModel, modelDir)}. ` +
        `Run "ghost-story install ctc-model ${variant}" or allow auto-install.`,
    )
  }

  const source = isAudioSource(input)
    ? input
    : normalizeToAudioSource(input, opts.inputFormat)

  const inputPath = toFilePath(source)
  if (inputPath && !existsSync(inputPath)) {
    throw new Error(`Input file does not exist: ${inputPath}`)
  }

  // The model takes mono 16 kHz float samples, so decode straight to those in a
  // single ffmpeg pass rather than writing an intermediate wav and decoding that.
  timing.setMetadata("conversionRequired", true)
  timing.setMetadata("targetFormat", "f32le")
  const audio = await timing.timeAsync("conversion", () =>
    readAudioAsFloat32(source),
  )

  if (signal?.aborted) {
    throw signal.reason
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
    await using modelInfo = await loadWav2Vec2Model(
      opts.device,
      opts.dtype,
      modelDir,
    )

    if (signal?.aborted) {
      throw signal.reason
    }

    const SAMPLE_RATE = 16000

    const SECONDS_PER_CHUNK = 25
    const CHUNK_SIZE_SAMPLES = SAMPLE_RATE * SECONDS_PER_CHUNK

    const strides =
      "model" in modelInfo
        ? modelInfo.model.config.conv_stride
        : modelInfo.convStride

    if (strides === undefined) {
      throw new Error(`Failed to read conv_stride from model config`)
    }

    const kernels =
      "model" in modelInfo
        ? modelInfo.model.config.conv_kernel
        : modelInfo.convKernel
    if (kernels === undefined) {
      throw new Error(`Failed to read conv_kernel from model config`)
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

      const logits = await computeWav2Vec2Logits(modelInfo, chunk)

      if (signal?.aborted) {
        throw signal.reason
      }

      const logProbs = logits.map((frame) => log_softmax(frame))
      emissions.push(...logProbs)

      framesPerChunk ??= logProbs.length
      secondsPerChunk ??= chunk.length / SAMPLE_RATE

      opts.onCheckpoint?.(emissions)

      opts.onProgress?.(i / audio.length)
    }

    const stride = strides.reduce((a, b) => a * b, 1)
    const secondsPerFrame = stride / SAMPLE_RATE

    const vocab =
      "tokenizer" in modelInfo
        ? modelInfo.tokenizer.get_vocab()
        : modelInfo.vocab

    const blankIndex =
      vocab.get("<blank>") ??
      ("tokenizer" in modelInfo
        ? modelInfo.tokenizer.pad_token_id
        : modelInfo.padTokenId)

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

interface HfModelInfo {
  model: PreTrainedModel
  tokenizer: PreTrainedTokenizer
  featureExtractor: FeatureExtractor
  [Symbol.asyncDispose]: () => Promise<void>
}

async function loadWav2Vec2Model(
  device: DeviceType | "mlx",
  dtype: DataType,
  modelDir: string,
): Promise<MlxModelInfo | HfModelInfo> {
  if (device === "mlx") {
    const { loadModel } = await import("@storyteller-platform/mlx-audio")

    return loadModel(getModelPackageDir(CTC_MODEL_PACKAGES.mlx, modelDir))
  }

  const model = await Wav2Vec2ForCTC.from_pretrained(
    "onnx-community/mms-300m-1130-forced-aligner-ONNX",
    {
      cache_dir: modelDir,
      device: device,
      dtype: dtype,
    },
  )

  const tokenizer = await Wav2Vec2CTCTokenizer.from_pretrained(
    "onnx-community/mms-300m-1130-forced-aligner-ONNX",
    {
      cache_dir: modelDir,
    },
  )

  const featureExtractor = await Wav2Vec2FeatureExtractor.from_pretrained(
    "onnx-community/mms-300m-1130-forced-aligner-ONNX",
    { cache_dir: modelDir },
  )

  return {
    model,
    tokenizer,
    featureExtractor,
    [Symbol.asyncDispose]: async () => {},
  }
}

async function computeWav2Vec2Logits(
  modelInfo: HfModelInfo | MlxModelInfo,
  samples: Float32Array,
): Promise<number[][]> {
  if (!("tokenizer" in modelInfo)) {
    const { compute } = await import("@storyteller-platform/mlx-audio")
    return compute(modelInfo, samples)
  }

  const { model, featureExtractor } = modelInfo

  const inputs = (await featureExtractor(samples)) as unknown

  const output = (await model.forward(inputs)) as { logits: Tensor }

  const logits = output.logits.tolist() as [number[][]]

  return logits[0]
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
