import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

import {
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
import { getModelDir, resolveWav2Vec2Device } from "../cli/config.ts"
import {
  getModelPackageDir,
  installModelPackage,
  isModelPackageInstalled,
} from "../cli/ctc-install.ts"
import {
  CTC_MODEL_PACKAGES,
  type CtcModel,
  type CtcModelFamily,
  type ResolvedWav2Vec2Device,
  WAV2VEC2_SECONDS_PER_CHUNK,
  type Wav2Vec2Device,
  resolveCtcModel,
} from "../constants.ts"
import { type Timing } from "../utilities/Timing.ts"

import {
  CONV_CTC_ONNX_FILE,
  type ConvCtcModel,
  loadConvCtcOnnxModel,
} from "./ConvCtcOnnx.ts"
import { type EmissionTokenizer, type Emissions } from "./Emissions.ts"
import { readSentencePieceModel, unigramTokenizer } from "./sentencepiece.ts"

declare module "@huggingface/transformers" {
  export interface PretrainedConfig {
    conv_stride?: number[]
    conv_kernel?: number[]
  }
}

export interface Wav2Vec2Options {
  modelDir?: string
  device?: Wav2Vec2Device
  model?: CtcModelFamily
  language?: string | null
  autoInstall?: boolean
  inputFormat?: AudioFormat
  loaded?: Wav2Vec2ModelBundle
  printOutput?: boolean
  samples?: () => Promise<Float32Array>
  onStart?: () => void
  onCheckpoint?: (emissions: Emissions) => void
  onProgress?: (progress: number) => void
}

const defaultOptions: Required<
  Pick<Wav2Vec2Options, "device" | "model" | "autoInstall" | "printOutput">
> = {
  autoInstall: true,
  device: "auto",
  model: "mms",
  printOutput: true,
}

export interface Wav2Vec2ModelBundle {
  // modelId: Wav2Vec2Model
  device: Wav2Vec2Device
  model: Awaited<ReturnType<typeof Wav2Vec2ForCTC.from_pretrained>>
  tokenizer: Awaited<ReturnType<typeof Wav2Vec2CTCTokenizer.from_pretrained>>
  featureExtractor: Awaited<
    ReturnType<typeof Wav2Vec2FeatureExtractor.from_pretrained>
  >
}

// export async function loadWav2Vec2Model(
//   options: LoadWav2Vec2ModelOptions,
// ): Promise<Wav2Vec2ModelBundle> {
//   const modelDir = options.modelDir ?? getModelDir()
//   await ensureDir(modelDir)

//   const model = await Wav2Vec2ForCTC.from_pretrained(options.model, {
//     cache_dir: modelDir,
//     device: options.device ?? defaultOptions.device,
//     dtype: options.dtype ?? defaultOptions.dtype,
//   })

//   if (options.signal?.aborted) {
//     throw options.signal.reason
//   }

//   const tokenizer = await Wav2Vec2CTCTokenizer.from_pretrained(options.model, {
//     cache_dir: modelDir,
//   })

//   if (options.signal?.aborted) {
//     throw options.signal.reason
//   }

//   const featureExtractor = await Wav2Vec2FeatureExtractor.from_pretrained(
//     options.model,
//     { cache_dir: modelDir },
//   )

//   if (options.signal?.aborted) {
//     throw options.signal.reason
//   }

//   return { modelId: options.model, model, tokenizer, featureExtractor }
// }

export async function emit(
  input: RawAudioInput | AudioSource,
  timing: Timing,
  options: Wav2Vec2Options,
  signal?: AbortSignal | null,
): Promise<Wav2Vec2Result> {
  const opts = { ...defaultOptions, ...options }
  const modelDir = opts.modelDir ?? getModelDir()
  const device = resolveWav2Vec2Device(opts.device, null)
  const variant = resolveCtcModel(opts.model, opts.language, device)
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
        `Run "ghost-story install ctc-model ${opts.model} --language ${opts.language ?? "en"} --device ${device}" or allow auto-install.`,
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
  const readSamples = opts.samples
  timing.setMetadata("conversionRequired", readSamples === undefined)
  timing.setMetadata("targetFormat", "f32le")
  const audio = await timing.timeAsync("conversion", () =>
    readSamples === undefined ? readAudioAsFloat32(source) : readSamples(),
  )

  let audioLength: number | undefined
  if (source.type === "file") {
    // get duration from file
    const duration = await getAudioDuration(source.path)
    audioLength = duration
    timing.setMetadata("audioLength", duration)
  }

  if (signal?.aborted) {
    throw signal.reason
  }

  opts.onStart?.()

  const start = performance.now()
  const {
    emissions,
    vocab,
    blankIndex,
    framesPerChunk,
    secondsPerChunk,
    secondsPerFrame,
    frameOffsetSeconds,
    tokenizer,
  } = await timing.timeAsync("transcription", async () => {
    await using modelInfo = await loadWav2Vec2Model(variant, device, modelDir)

    timing.setMetadata("device", device)
    timing.setMetadata("model", variant)

    if (signal?.aborted) {
      throw signal.reason
    }

    const SAMPLE_RATE = 16000

    const CHUNK_SIZE_SAMPLES = SAMPLE_RATE * WAV2VEC2_SECONDS_PER_CHUNK

    let samplesPerFrame: number
    let minChunkSamples: number
    if ("model" in modelInfo) {
      const strides: number[] | undefined = modelInfo.model.config.conv_stride
      const kernels: number[] | undefined = modelInfo.model.config.conv_kernel
      if (strides === undefined || kernels === undefined) {
        throw new Error(
          `Failed to read conv_stride and conv_kernel from model config`,
        )
      }
      minChunkSamples = 1
      let jump = 1
      for (let i = 0; i < kernels.length; i++) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        minChunkSamples += (kernels[i]! - 1) * jump
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        jump *= strides[i]!
      }
      samplesPerFrame = strides.reduce((a, b) => a * b, 1)
    } else {
      samplesPerFrame = modelInfo.samplesPerFrame
      minChunkSamples = modelInfo.minSamples
    }

    const chunkCount = Math.ceil(audio.length / CHUNK_SIZE_SAMPLES)
    let values: Float32Array | null = null
    let classes = 0
    let written = 0
    let totalFrames = 0
    let framesPerChunk: null | number = null
    let secondsPerChunk: null | number = null

    for (let i = 0; i < audio.length; i += CHUNK_SIZE_SAMPLES) {
      const chunk = audio.slice(i, i + CHUNK_SIZE_SAMPLES)

      // Skip audio with too few samples to fill one frame, which causes
      // a crash
      if (chunk.length < minChunkSamples) continue

      const logits = await computeLogProbs(modelInfo, chunk)

      if (signal?.aborted) {
        throw signal.reason
      }

      if (values === null) {
        classes = logits.classes
        values = new Float32Array(chunkCount * logits.frames * classes)
      }

      values.set(logits.values.subarray(0, logits.frames * classes), written)
      written += logits.frames * classes
      totalFrames += logits.frames

      framesPerChunk ??= logits.frames
      secondsPerChunk ??= chunk.length / SAMPLE_RATE

      opts.onCheckpoint?.({
        values: values.subarray(0, written),
        frames: totalFrames,
        classes,
      })

      opts.onProgress?.(i / audio.length)
    }

    const emissions: Emissions = {
      values: values?.subarray(0, written) ?? new Float32Array(0),
      frames: totalFrames,
      classes,
    }

    const secondsPerFrame = samplesPerFrame / SAMPLE_RATE

    const vocab =
      "model" in modelInfo ? modelInfo.tokenizer.get_vocab() : modelInfo.vocab

    const blankIndex =
      vocab.get("<blank>") ??
      ("model" in modelInfo
        ? modelInfo.tokenizer.pad_token_id
        : modelInfo.blankId)

    const frameOffsetSeconds =
      "model" in modelInfo ? 0 : modelInfo.frameOffsetSeconds

    const tokenizer =
      "model" in modelInfo || modelInfo.tokenizer === null
        ? null
        : await readTokenizer(getModelPackageDir(ctcModel, modelDir), vocab)

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
      frameOffsetSeconds,
      tokenizer,
    }
  })
  const end = performance.now()

  if (audioLength) {
    timing.setMetadata("x Realtime", (audioLength * 1000) / (end - start))
  }

  return {
    emissions,
    numFrames: emissions.frames,
    vocab,
    blankIndex,
    secondsPerChunk,
    framesPerChunk,
    secondsPerFrame,
    frameOffsetSeconds,
    tokenizer,
  }
}

async function readTokenizer(
  packageDir: string,
  vocab: Map<string, number>,
): Promise<EmissionTokenizer> {
  const bytes = await readFile(join(packageDir, "tokenizer.spm"))
  return unigramTokenizer(readSentencePieceModel(bytes), vocab)
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
  variant: CtcModel,
  device: ResolvedWav2Vec2Device,
  modelDir: string,
): Promise<ConvCtcModel | HfModelInfo> {
  if (CTC_MODEL_PACKAGES[variant].entryFile === "model.safetensors") {
    const packageDir = getModelPackageDir(CTC_MODEL_PACKAGES[variant], modelDir)
    if (device !== "mlx") {
      if (!existsSync(join(packageDir, CONV_CTC_ONNX_FILE))) {
        throw new Error(
          `${variant} only runs on the mlx device, it has no ${CONV_CTC_ONNX_FILE}`,
        )
      }
      return loadConvCtcOnnxModel(packageDir, device)
    }

    const { loadModel, compute } = await import(
      "@storyteller-platform/mlx-audio"
    )
    const model = await loadModel(packageDir)

    return {
      vocab: model.vocab,
      samplesPerFrame: model.samplesPerFrame,
      minSamples: model.minSamples,
      blankId: model.blankId,
      frameOffsetSeconds: model.frameOffsetSeconds,
      tokenizer: model.tokenizer,
      compute: (samples) => compute(model, samples),
      [Symbol.asyncDispose]: model[Symbol.asyncDispose],
    }
  }

  if (device === "mlx") {
    throw new Error(
      `The mlx device only runs MLX models, and ${variant} is not one`,
    )
  }

  const model = await Wav2Vec2ForCTC.from_pretrained(
    "onnx-community/mms-300m-1130-forced-aligner-ONNX",
    {
      cache_dir: modelDir,
      device: device,
      dtype: variant === "fp16" ? "fp16" : "fp32",
      model_file_name: "model",
      // config: {}
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

async function computeLogProbs(
  modelInfo: HfModelInfo | ConvCtcModel,
  samples: Float32Array,
): Promise<Emissions> {
  if (!("model" in modelInfo)) {
    return await modelInfo.compute(samples)
  }

  const { model, featureExtractor } = modelInfo

  const inputs = (await featureExtractor(samples)) as unknown

  const output = (await model.forward(inputs)) as { logits: Tensor }

  const [rows] = output.logits.tolist() as [number[][]]

  const classes = rows[0]?.length ?? 0
  const values = new Float32Array(rows.length * classes)
  rows.forEach((row, frame) => {
    values.set(log_softmax(row), frame * classes)
  })

  return { values, frames: rows.length, classes }
}

export interface Wav2Vec2Result {
  emissions: Emissions
  numFrames: number
  vocab: Map<string, number>
  blankIndex: number
  secondsPerChunk: number
  framesPerChunk: number
  secondsPerFrame: number
  frameOffsetSeconds: number
  tokenizer: EmissionTokenizer | null
}
