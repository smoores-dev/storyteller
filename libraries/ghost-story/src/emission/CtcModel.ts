import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { ensureDir } from "fs-extra"

import { getModelDir } from "../cli/config.ts"
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
  resolveCtcDevice,
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
  compute: (chunks: Float32Array[]) => Promise<Emissions[]>
  [Symbol.asyncDispose]: () => Promise<void>
}

export interface CtcRunOptions {
  device?: CtcDevice | null | undefined
  model?: CtcModelFamily | null | undefined
  language?: string | null | undefined
  /** Precision on GPU devices, CPU always runs float32. Unset means the model family's default. */
  dtype?: CtcDataType | null | undefined
  /** How many equal length ~25s chunks go through the model per call. If unset, defaults to 2 on a GPU and 1 on a CPU. */
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
  startOffsetSeconds: number
  endOffsetSeconds: number
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
  const modelPackage = CTC_MODEL_PACKAGES[variant]
  return {
    family,
    architecture: info.architecture,
    tokenizer: info.tokenizer,
    variant,
    package: modelPackage,
    device,
    dtype,
    batchSize: resolveCtcBatchSize(device, options.batchSize),
    chunkSeconds: info.chunkSeconds,
    startOffsetSeconds:
      modelPackage.startOffsetSeconds ?? info.startOffsetSeconds,
    endOffsetSeconds: modelPackage.endOffsetSeconds ?? info.endOffsetSeconds,
  }
}

export interface LoadedCtcModel extends CtcBackend {
  run: CtcRun
  blankIndex: number
  startOffsetSeconds: number
  endOffsetSeconds: number
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

  const install = async (target: CtcRun) => {
    if (options.autoInstall ?? true) {
      await time("installation", async () => {
        if (isModelPackageInstalled(target.package, modelDir)) return
        await installModelPackage(target.package, {
          modelDir,
          printOutput: options.printOutput ?? true,
        })
      })
      return
    }
    if (!isModelPackageInstalled(target.package, modelDir)) {
      throw new Error(
        `${target.package.name} is not installed in ${getModelPackageDir(target.package, modelDir)}. ` +
          `Run "ghost-story install ctc-model ${target.family} --language ${target.variant.split("_")[1] ?? "en"} --device ${target.device}" or allow auto-install.`,
      )
    }
  }

  await install(run)

  if (signal?.aborted) throw signal.reason

  let activeRun = run
  let backend: CtcBackend
  try {
    backend = await time("load", () =>
      loadBackend(run, getModelPackageDir(run.package, modelDir), modelDir),
    )
  } catch (error) {
    if ((run.device !== "webgpu" && run.device !== "dml") || signal?.aborted) {
      throw error
    }
    console.warn(
      `[ghost-story] ${run.device} could not load ${run.variant} (${error instanceof Error ? error.message : String(error)}), falling back to the cpu`,
    )
    activeRun = cpuFallbackRun(run)
    await install(activeRun)
    backend = await time("load", () =>
      loadBackend(
        activeRun,
        getModelPackageDir(activeRun.package, modelDir),
        modelDir,
      ),
    )
  }

  if (signal?.aborted) {
    await backend[Symbol.asyncDispose]()
    throw signal.reason
  }

  const packageDir = getModelPackageDir(activeRun.package, modelDir)
  const tokenizer =
    activeRun.tokenizer === "sentencepiece"
      ? unigramTokenizer(
          readSentencePieceModel(
            await readFile(join(packageDir, "tokenizer.spm")),
          ),
          backend.vocab,
        )
      : null

  return {
    ...backend,
    run: activeRun,
    blankIndex: backend.vocab.get("<blank>") ?? backend.blankId,
    startOffsetSeconds: activeRun.startOffsetSeconds,
    endOffsetSeconds: activeRun.endOffsetSeconds,
    tokenizer,
  }
}

function cpuFallbackRun(run: CtcRun): CtcRun {
  const variant = resolveCtcModelVariant(
    run.family,
    run.variant.split("_")[1],
    "cpu",
    "fp32",
  )
  return {
    ...run,
    device: "cpu",
    dtype: "fp32",
    variant,
    package: CTC_MODEL_PACKAGES[variant],
    batchSize: resolveCtcBatchSize("cpu", null),
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
