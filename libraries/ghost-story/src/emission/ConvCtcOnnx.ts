import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { InferenceSession, Tensor } from "onnxruntime-node"

import { type Wav2Vec2Device } from "../constants.ts"

import { type Emissions } from "./Emissions.ts"
import { MelFrontend } from "./melFrontend.ts"

export const CONV_CTC_ONNX_FILE = "model.onnx"

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
  samplesPerFrame: number
  minSamples: number
  blankId: number
  frameOffsetSeconds: number
  tokenizer: "sentencepiece" | null
  compute: (samples: Float32Array) => Promise<Emissions>
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

export async function loadConvCtcOnnxModel(
  packageDir: string,
  device: Wav2Vec2Device,
): Promise<ConvCtcModel> {
  const config = JSON.parse(
    await readFile(join(packageDir, "config.json"), "utf8"),
  ) as ConvCtcConfig
  const tokenizer = config.tokenizer ?? null
  const vocab = await readVocab(join(packageDir, "vocab.txt"), tokenizer === null)
  const frontend = new MelFrontend({
    sampleRate: config.sampleRate,
    melBins: config.melBins,
    windowSamples: config.windowSamples ?? 320,
  })
  const session = await InferenceSession.create(
    join(packageDir, CONV_CTC_ONNX_FILE),
    { executionProviders: onnxExecutionProviders(device) },
  )
  const [featuresInput, lengthInput] = session.inputNames
  const [logProbsOutput] = session.outputNames
  if (featuresInput === undefined || logProbsOutput === undefined) {
    throw new Error(`${packageDir} model.onnx has no inputs or outputs`)
  }
  const space = tokenizer === null ? vocab.get("|") : undefined

  async function compute(samples: Float32Array): Promise<Emissions> {
    const features = frontend.features(samples)
    const transposed = new Float32Array(features.values.length)
    for (let f = 0; f < features.frames; f++) {
      for (let m = 0; m < features.melBins; m++) {
        transposed[m * features.frames + f] = features.values[
          f * features.melBins + m
        ] as number
      }
    }
    const feeds: Record<string, Tensor> = {
      [featuresInput as string]: new Tensor("float32", transposed, [
        1,
        features.melBins,
        features.frames,
      ]),
    }
    if (lengthInput !== undefined) {
      feeds[lengthInput] = new Tensor(
        "int64",
        BigInt64Array.from([BigInt(features.frames)]),
        [1],
      )
    }
    const output = (await session.run(feeds))[logProbsOutput as string]
    if (output === undefined || output.type !== "float32") {
      throw new Error(`${packageDir} model.onnx did not return float32 log probabilities`)
    }
    const [, frames = 0, classes = 0] = output.dims
    const values = new Float32Array(output.data as Float32Array)
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
  }

  return {
    vocab,
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
