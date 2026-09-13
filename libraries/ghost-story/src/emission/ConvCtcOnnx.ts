import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { InferenceSession, Tensor } from "onnxruntime-node"

import { type Wav2Vec2DataType, type Wav2Vec2Device } from "../constants.ts"

import { type Emissions } from "./Emissions.ts"
import { MelFrontend, PRE_EMPHASIS } from "./melFrontend.ts"

export const CONV_CTC_ONNX_FILE = "model.onnx"
export const CONV_CTC_ONNX_FP16_FILE = "model_fp16.onnx"

const SIGNAL_INPUT = "signal"
const FOLDED_SPACE_SCORE = -30

interface ConvCtcConfig {
  architecture: string
  sampleRate: number
  melBins: number
  windowSamples?: number
  samplesPerFrame: number
  blank: number
  classes: number
  tokenizer?: "sentencepiece" | null
  frameOffsetSeconds?: number
}

export interface ConvCtcModel {
  vocab: Map<string, number>
  dtype: Wav2Vec2DataType
  samplesPerFrame: number
  minSamples: number
  blankId: number
  frameOffsetSeconds: number
  tokenizer: "sentencepiece" | null
  compute: (chunks: Float32Array[]) => Promise<Emissions[]>
  [Symbol.asyncDispose]: () => Promise<void>
}

export function onnxExecutionProviders(
  device: Wav2Vec2Device,
): InferenceSession.ExecutionProviderConfig[] {
  switch (device) {
    case "cuda":
      return ["cuda"]
    case "webgpu":
      return ["webgpu"]
    case "cpu":
    case "auto":
      return ["cpu"]
    case "mlx":
      throw new Error("The mlx device does not run ONNX models")
  }
}

async function readVocab(
  path: string,
  characterLevel: boolean,
): Promise<Map<string, number>> {
  const vocab = new Map<string, number>()
  for (const line of (await readFile(path, "utf8")).split("\n")) {
    if (line === "") continue
    const separator = line.lastIndexOf(" ")
    const token = line.slice(0, separator)
    const index = Number(line.slice(separator + 1))
    if (!characterLevel) {
      vocab.set(token, index)
    } else if (token === "<blk>") {
      vocab.set("<blank>", index)
    } else if (token === "▁") {
      vocab.set("|", index)
    } else {
      vocab.set(token, index)
    }
  }
  return vocab
}

function logAddExp(a: number, b: number): number {
  if (a === -Infinity) return b
  if (b === -Infinity) return a
  const max = Math.max(a, b)
  return max + Math.log1p(Math.exp(-Math.abs(a - b)))
}

/**
 * Pre-emphasis and reflect padding are the only parts of the mel front end
 * that stay outside the graph, one pass over the samples each.
 */
function prepareSignal(samples: Float32Array, pad: number): Float32Array {
  const padded = new Float32Array(samples.length + 2 * pad)
  padded[pad] = samples[0] as number
  for (let i = 1; i < samples.length; i++) {
    padded[pad + i] =
      (samples[i] as number) - PRE_EMPHASIS * (samples[i - 1] as number)
  }
  for (let j = 1; j <= pad; j++) {
    padded[pad - j] = padded[pad + j] as number
    padded[pad + samples.length - 1 + j] = padded[
      pad + samples.length - 1 - j
    ] as number
  }
  return padded
}

function stack(rows: Float32Array[]): Float32Array {
  const length = rows[0]?.length ?? 0
  const stacked = new Float32Array(length * rows.length)
  rows.forEach((row, index) => {
    stacked.set(row, index * length)
  })
  return stacked
}

export async function loadConvCtcOnnxModel(
  packageDir: string,
  device: Wav2Vec2Device,
  dtype: Wav2Vec2DataType,
): Promise<ConvCtcModel> {
  const config = JSON.parse(
    await readFile(join(packageDir, "config.json"), "utf8"),
  ) as ConvCtcConfig
  const tokenizer = config.tokenizer ?? null
  const vocab = await readVocab(
    join(packageDir, "vocab.txt"),
    tokenizer === null,
  )
  const frontend = new MelFrontend({
    sampleRate: config.sampleRate,
    melBins: config.melBins,
    windowSamples: config.windowSamples ?? 320,
  })
  const halfPrecisionFile = join(packageDir, CONV_CTC_ONNX_FP16_FILE)
  const useHalfPrecision = dtype === "fp16" && existsSync(halfPrecisionFile)
  const session = await InferenceSession.create(
    useHalfPrecision ? halfPrecisionFile : join(packageDir, CONV_CTC_ONNX_FILE),
    { executionProviders: onnxExecutionProviders(device) },
  )
  const [firstInput, lengthInput] = session.inputNames
  const [outputName] = session.outputNames
  if (firstInput === undefined || outputName === undefined) {
    throw new Error(`${packageDir} model.onnx has no inputs or outputs`)
  }
  const logProbsOutput = outputName
  const featuresInput = firstInput
  // Packages exported with the front end in the graph take the prepared
  // signal, older ones take features from the TypeScript front end.
  const graphHasFrontend = featuresInput === SIGNAL_INPUT
  const space = tokenizer === null ? vocab.get("|") : undefined

  function feedsFor(chunks: Float32Array[]): Record<string, Tensor> {
    if (graphHasFrontend) {
      const signals = chunks.map((chunk) =>
        prepareSignal(chunk, frontend.fftSize / 2),
      )
      return {
        [SIGNAL_INPUT]: new Tensor("float32", stack(signals), [
          chunks.length,
          1,
          signals[0]?.length ?? 0,
        ]),
      }
    }
    const features = chunks.map((chunk) => frontend.features(chunk))
    const frames = features[0]?.frames ?? 0
    const transposed = features.map((chunkFeatures) => {
      const values = new Float32Array(chunkFeatures.values.length)
      for (let f = 0; f < chunkFeatures.frames; f++) {
        for (let m = 0; m < chunkFeatures.melBins; m++) {
          values[m * chunkFeatures.frames + f] = chunkFeatures.values[
            f * chunkFeatures.melBins + m
          ] as number
        }
      }
      return values
    })
    const feeds: Record<string, Tensor> = {
      [featuresInput]: new Tensor("float32", stack(transposed), [
        chunks.length,
        frontend.melBins,
        frames,
      ]),
    }
    if (lengthInput !== undefined) {
      feeds[lengthInput] = new Tensor(
        "int64",
        BigInt64Array.from(chunks.map(() => BigInt(frames))),
        [chunks.length],
      )
    }
    return feeds
  }

  async function compute(chunks: Float32Array[]): Promise<Emissions[]> {
    if (chunks.length === 0) return []
    const output = (await session.run(feedsFor(chunks)))[logProbsOutput]
    if (output === undefined || output.type !== "float32") {
      throw new Error(
        `${packageDir} model.onnx did not return float32 log probabilities`,
      )
    }
    const [, frames = 0, classes = 0] = output.dims
    const all = output.data as Float32Array
    const stride = frames * classes
    return chunks.map((_, index) => {
      const values = new Float32Array(
        all.subarray(index * stride, (index + 1) * stride),
      )
      if (space !== undefined) {
        for (let f = 0; f < frames; f++) {
          const row = f * classes
          values[row + config.blank] = logAddExp(
            values[row + config.blank] as number,
            values[row + space] as number,
          )
          values[row + space] = FOLDED_SPACE_SCORE
        }
      }
      return { values, frames, classes }
    })
  }

  return {
    vocab,
    dtype: useHalfPrecision ? "fp16" : "fp32",
    samplesPerFrame: config.samplesPerFrame,
    minSamples: frontend.minSamples,
    blankId: config.blank,
    frameOffsetSeconds: config.frameOffsetSeconds ?? 0,
    tokenizer,
    compute,
    [Symbol.asyncDispose]: async () => {
      await session.release()
    },
  }
}
