import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { ensureDir } from "fs-extra"

import { getModelDir, resolveCtcDevice } from "../cli/config.ts"
import {
  getModelPackageDir,
  installModelPackage,
  isModelPackageInstalled,
} from "../cli/ctc-install.ts"
import {
  CTC_MODEL_FAMILY_INFO,
  CTC_MODEL_PACKAGES,
  type CtcArchitecture,
  type CtcDataType,
  type CtcDevice,
  type CtcModelFamily,
  type CtcModelPackage,
  type CtcModelVariant,
  type CtcTokenizer,
  type ResolvedCtcDevice,
  resolveCtcBatchSize,
  resolveCtcDtype,
  resolveCtcModelVariant,
} from "../constants.ts"
import { type Timing } from "../utilities/Timing.ts"

import { CONV_CTC_ONNX_FILE, loadConvCtcOnnxModel } from "./ConvCtcOnnx.ts"
import { type EmissionTokenizer, type Emissions } from "./Emissions.ts"
import { loadWav2Vec2OnnxModel } from "./Wav2Vec2Onnx.ts"
import { readSentencePieceModel, unigramTokenizer } from "./sentencepiece.ts"

export interface CtcBackend {
  vocab: Map<string, number>
  /** The precision the weights run in, which falls back to float32 when a package has no half precision file. */
  dtype: CtcDataType
  samplesPerFrame: number
  /** The fewest samples one chunk needs to produce a frame at all. */
  minSamples: number
  blankId: number
  frameOffsetSeconds: number
  compute: (chunks: Float32Array[]) => Promise<Emissions[]>
  [Symbol.asyncDispose]: () => Promise<void>
}

export interface CtcRunOptions {
  device?: CtcDevice | null | undefined
  model?: CtcModelFamily | null | undefined
  language?: string | null | undefined
  /** Precision on GPU devices, CPU always runs float32. Unset means the model family's default. */
  dtype?: CtcDataType | null | undefined
  /** How many equal length chunks go through the model per call. Unset picks 2 on a GPU and 1 on a CPU. */
  batchSize?: number | null | undefined
  /** The installed whisper build, which hints at the GPU when the device is left on auto. */
  buildVariant?: string | null | undefined
}

export interface CtcRun {
  family: CtcModelFamily
  architecture: CtcArchitecture
  tokenizer: CtcTokenizer
  variant: CtcModelVariant
  package: CtcModelPackage
  device: ResolvedCtcDevice
  dtype: CtcDataType
  batchSize: number
  chunkSeconds: number
}

export function resolveCtcRun(options: CtcRunOptions): CtcRun {
  const family = options.model ?? "mms"
  const info = CTC_MODEL_FAMILY_INFO[family]
  const device = resolveCtcDevice(options.device, options.buildVariant)
  const dtype = resolveCtcDtype(family, device, options.dtype)
  const variant = resolveCtcModelVariant(
    family,
    options.language,
    device,
    dtype,
  )
  return {
    family,
    architecture: info.architecture,
    tokenizer: info.tokenizer,
    variant,
    package: CTC_MODEL_PACKAGES[variant],
    device,
    dtype,
    batchSize: resolveCtcBatchSize(device, options.batchSize),
    chunkSeconds: info.chunkSeconds,
  }
}

export interface LoadedCtcModel extends CtcBackend {
  run: CtcRun
  blankIndex: number
  tokenizer: EmissionTokenizer | null
}

export interface LoadCtcModelOptions {
  modelDir?: string | undefined
  autoInstall?: boolean | undefined
  printOutput?: boolean | undefined
  timing?: Timing | null | undefined
  signal?: AbortSignal | null | undefined
}

/**
 * Installs the package if needed and loads it on the run's device
 */
export async function loadCtcModel(
  run: CtcRun,
  options: LoadCtcModelOptions = {},
): Promise<LoadedCtcModel> {
  const modelDir = options.modelDir ?? getModelDir()
  const { timing, signal } = options
  const time = <T>(name: string, fn: () => Promise<T>) =>
    timing ? timing.timeAsync(name, fn) : fn()

  await ensureDir(modelDir)

  if (options.autoInstall ?? true) {
    await time("installation", async () => {
      if (isModelPackageInstalled(run.package, modelDir)) return
      await installModelPackage(run.package, {
        modelDir,
        printOutput: options.printOutput ?? true,
      })
    })
  } else if (!isModelPackageInstalled(run.package, modelDir)) {
    throw new Error(
      `${run.package.name} is not installed in ${getModelPackageDir(run.package, modelDir)}. ` +
        `Run "ghost-story install ctc-model ${run.family} --language ${run.variant.split("_")[1] ?? "en"} --device ${run.device}" or allow auto-install.`,
    )
  }

  if (signal?.aborted) throw signal.reason

  const packageDir = getModelPackageDir(run.package, modelDir)
  const backend = await time("load", () =>
    loadBackend(run, packageDir, modelDir),
  )

  if (signal?.aborted) {
    await backend[Symbol.asyncDispose]()
    throw signal.reason
  }

  const tokenizer =
    run.tokenizer === "sentencepiece"
      ? unigramTokenizer(
          readSentencePieceModel(
            await readFile(join(packageDir, "tokenizer.spm")),
          ),
          backend.vocab,
        )
      : null

  return {
    ...backend,
    run,
    blankIndex: backend.vocab.get("<blank>") ?? backend.blankId,
    tokenizer,
  }
}

async function loadBackend(
  run: CtcRun,
  packageDir: string,
  modelDir: string,
): Promise<CtcBackend> {
  if (run.device === "mlx") {
    if (run.package.entryFile !== "model.safetensors") {
      throw new Error(
        `The mlx device only runs MLX models, and ${run.variant} is not one`,
      )
    }
    const { loadModel, compute } =
      await import("@storyteller-platform/mlx-audio")
    const model = await loadModel(packageDir, { dtype: run.dtype })
    return {
      vocab: model.vocab,
      dtype: model.dtype,
      samplesPerFrame: model.samplesPerFrame,
      minSamples: model.minSamples,
      blankId: model.blankId,
      frameOffsetSeconds: model.frameOffsetSeconds,
      compute: (chunks) => compute(model, chunks),
      [Symbol.asyncDispose]: model[Symbol.asyncDispose],
    }
  }

  if (run.architecture === "wav2vec2") {
    return loadWav2Vec2OnnxModel(
      run.package.subdir,
      modelDir,
      run.device,
      run.dtype,
    )
  }

  if (!existsSync(join(packageDir, CONV_CTC_ONNX_FILE))) {
    throw new Error(
      `${run.variant} only runs on the mlx device, it has no ${CONV_CTC_ONNX_FILE}`,
    )
  }
  return loadConvCtcOnnxModel(packageDir, run.tokenizer, run.device, run.dtype)
}
