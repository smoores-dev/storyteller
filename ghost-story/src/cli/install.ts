/* eslint-disable no-console */

import {
  createReadStream,
  createWriteStream,
  existsSync,
  statSync,
} from "node:fs"
import { mkdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { pipeline } from "node:stream/promises"
import { createGunzip } from "node:zlib"

import chalk from "chalk"
import { Presets, SingleBar } from "cli-progress"
import { extract } from "tar"

import {
  type BuildVariant,
  MODEL_SIZES,
  type WhisperModel,
  getBinaryDownloadUrl,
  getCompatibleVariants,
  getCoremlModelDownloadUrl,
  getCoremlModelPath,
  getInstallDir,
  getInstalledVariant,
  getModelDir,
  getModelDownloadUrl,
  getModelPath,
  getVadModelDownloadUrl,
  getVadModelPath,
  getWhisperExecutablePath,
  isVariantCompatibleWithCurrentPlatform,
  needsCoremlModel,
  resolveVariant,
  writeConfig,
} from "./config.ts"

export interface DownloadOptions {
  url: string
  destPath: string
  expectedSize?: number
  printOutput?: boolean
  onProgress?: ((downloaded: number, total: number) => void) | undefined
  signal?: AbortSignal | null | undefined
}

export async function downloadFile(options: DownloadOptions): Promise<void> {
  const {
    url,
    destPath,
    expectedSize,
    printOutput = true,
    onProgress,
    signal,
  } = options

  console.log(`Downloading file from ${url} to ${destPath}`)
  const response = await fetch(url, { signal: signal ?? null })

  if (!response.ok) {
    throw new Error(
      `Failed to download: ${response.status} ${response.statusText}`,
    )
  }

  const contentLength = response.headers.get("content-length")
  const totalSize = contentLength
    ? parseInt(contentLength, 10)
    : expectedSize ?? 0

  if (!response.body) {
    throw new Error("Response body is null")
  }

  await mkdir(path.dirname(destPath), { recursive: true })

  const fileStream = createWriteStream(destPath)

  const progressBar = new SingleBar(
    {
      etaBuffer: 2,
      hideCursor: null,
      noTTYOutput: !process.stderr.isTTY,
      autopadding: true,
      format: `${chalk.yellow("{bar}")} | {percentage}% | {current}/{sum} MB | ({speed} MB/s)`,
    },
    Presets.shades_classic,
  )

  const reader =
    response.body.getReader() as ReadableStreamDefaultReader<Uint8Array>

  let downloaded = 0
  let lastTime = Date.now()
  let lastDownloaded = 0

  if (printOutput) {
    progressBar.start(totalSize, 0, {
      current: "0 MB",
      sum: `${(totalSize / 1024 / 1024).toFixed(2)} MB`,
      speed: 0,
    })
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-constant-condition
    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        break
      }

      downloaded += value.length
      fileStream.write(value)

      onProgress?.(downloaded, totalSize)

      if (printOutput && totalSize > 0) {
        const deltaTime = Date.now() - lastTime

        const shouldPrint = deltaTime > 1000 || downloaded === totalSize

        if (shouldPrint) {
          const speed =
            (downloaded - lastDownloaded) / 1024 / 1024 / (deltaTime / 1000)
          lastTime = Date.now()
          lastDownloaded = downloaded

          progressBar.update(downloaded, {
            current: (downloaded / 1024 / 1024).toFixed(2),
            sum: (totalSize / 1024 / 1024).toFixed(2),
            speed: speed.toFixed(2),
          })
        }
      }
    }
  } finally {
    fileStream.end()
    if (printOutput) {
      progressBar.stop()
    }
  }

  await new Promise<void>((resolve, reject) => {
    fileStream.on("finish", resolve)
    fileStream.on("error", reject)
  })
}

export class PlatformMismatchError extends Error {
  constructor(
    public readonly variant: BuildVariant,
    public readonly compatibleVariants: BuildVariant[],
  ) {
    const compatible = compatibleVariants.join(", ")
    super(
      `Variant "${variant}" is not compatible with the current platform. ` +
        `Compatible variants: ${compatible}. Use --force to override.`,
    )
    this.name = "PlatformMismatchError"
  }
}

export interface InstallBinaryOptions {
  variant?: BuildVariant | undefined
  printOutput?: boolean | undefined
  force?: boolean | undefined
  signal?: AbortSignal | null | undefined
}

export async function installBinary(
  options: InstallBinaryOptions = {},
): Promise<string> {
  const {
    variant = resolveVariant(),
    printOutput = true,
    force = false,
    signal,
  } = options

  if (!force && !isVariantCompatibleWithCurrentPlatform(variant)) {
    throw new PlatformMismatchError(variant, getCompatibleVariants())
  }

  const installDir = getInstallDir(variant)
  const executablePath = getWhisperExecutablePath(installDir)

  if (!force && existsSync(executablePath)) {
    if (printOutput) {
      console.log(`whisper.cpp (${variant}) already installed at ${installDir}`)
    }
    return installDir
  }

  if (force && existsSync(installDir)) {
    if (printOutput) {
      console.log(`Removing existing installation at ${installDir}`)
    }
    await rm(installDir, { recursive: true })
  }

  const url = getBinaryDownloadUrl(variant)
  const tmpDir = path.join(os.tmpdir(), "ghost-story-whisper-install")
  const tarballPath = path.join(tmpDir, `whisper-cpp-${variant}.tar.gz`)

  if (printOutput) {
    console.log(`Downloading whisper.cpp (${variant}) from ${url}`)
  }

  await downloadFile({
    url,
    destPath: tarballPath,
    printOutput,
    signal,
  })

  if (printOutput) {
    console.log(`Extracting to ${installDir}`)
  }

  await mkdir(installDir, { recursive: true })

  await pipeline(
    createReadStream(tarballPath),
    createGunzip(),
    extract({ cwd: installDir, strip: 1 }),
  )

  await rm(tmpDir, { recursive: true }).catch(() => {})

  if (printOutput) {
    console.log(`whisper.cpp (${variant}) installed successfully`)
  }

  writeConfig({
    installedVariant: variant,
  })

  return installDir
}

export interface InstallModelOptions {
  model: WhisperModel
  modelDir?: string | undefined
  printOutput?: boolean
  force?: boolean
  onProgress?: ((downloaded: number, total: number) => void) | undefined
  signal?: AbortSignal | null | undefined
}

export async function installModel(
  options: InstallModelOptions,
): Promise<string> {
  const {
    model,
    modelDir = getModelDir(),
    printOutput = true,
    force = false,
    onProgress,
    signal,
  } = options

  const modelPath = getModelPath(model, modelDir)
  const expectedSize = MODEL_SIZES[model]

  if (!force && existsSync(modelPath)) {
    const stats = statSync(modelPath)
    if (stats.size === expectedSize) {
      if (printOutput) {
        console.log(`Model ${model} already exists at ${modelPath}`)
      }
      const installedVariant = getInstalledVariant()
      if (needsCoremlModel(installedVariant ?? undefined)) {
        await installCoremlModel({
          model,
          modelDir,
          printOutput,
          force,
          signal,
        })
      }
      return modelPath
    }
    if (printOutput) {
      console.log(
        `Model ${model} exists but has wrong size (${stats.size} vs ${expectedSize}), re-downloading`,
      )
    }
  }

  const url = getModelDownloadUrl(model)

  if (printOutput) {
    console.log(`Downloading model ${model}`)
  }

  await downloadFile({
    url,
    destPath: modelPath,
    expectedSize,
    printOutput,
    onProgress,
    signal,
  })

  const installedVariant = getInstalledVariant()
  if (needsCoremlModel(installedVariant ?? undefined)) {
    await installCoremlModel({ model, modelDir, printOutput, force, signal })
  }

  if (printOutput) {
    console.log(`Model ${model} installed successfully`)
  }

  return modelPath
}

export interface InstallCoremlModelOptions {
  model: WhisperModel
  modelDir?: string
  printOutput?: boolean
  force?: boolean
  signal?: AbortSignal | null | undefined
}

export async function installCoremlModel(
  options: InstallCoremlModelOptions,
): Promise<string> {
  const {
    model,
    modelDir = getModelDir(),
    printOutput = true,
    force = false,
    signal,
  } = options

  const coremlPath = getCoremlModelPath(model, modelDir)

  if (!force && existsSync(coremlPath)) {
    if (printOutput) {
      console.log(`CoreML model ${model} already exists at ${coremlPath}`)
    }
    return coremlPath
  }

  const url = getCoremlModelDownloadUrl(model)
  const tmpDir = path.join(os.tmpdir(), "ghost-story-coreml-install")
  const tarballPath = path.join(tmpDir, `ggml-${model}-encoder.mlmodelc.tar.gz`)

  if (printOutput) {
    console.log(`Downloading CoreML model ${model}`)
  }

  await downloadFile({
    url,
    destPath: tarballPath,
    printOutput,
    signal,
  })

  if (printOutput) {
    console.log(`Extracting CoreML model to ${modelDir}`)
  }

  await mkdir(modelDir, { recursive: true })

  await pipeline(
    createReadStream(tarballPath),
    createGunzip(),
    extract({ cwd: modelDir }),
  )

  await rm(tmpDir, { recursive: true }).catch(() => {})

  if (printOutput) {
    console.log(`CoreML model ${model} installed successfully`)
  }

  return coremlPath
}

export interface InstallVadModelOptions {
  modelDir?: string
  printOutput?: boolean
  force?: boolean
  onProgress?: (downloaded: number, total: number) => void
  signal?: AbortSignal | null | undefined
}

export async function installVadModel(
  options: InstallVadModelOptions = {},
): Promise<string> {
  const {
    modelDir = getModelDir(),
    printOutput = true,
    force = false,
    onProgress,
    signal,
  } = options

  const modelPath = getVadModelPath(modelDir)
  const expectedSize = MODEL_SIZES["silero-vad"]

  if (!force && existsSync(modelPath)) {
    const stats = statSync(modelPath)
    if (stats.size === expectedSize) {
      if (printOutput) {
        console.log(`VAD model already exists at ${modelPath}`)
      }
      return modelPath
    }
    if (printOutput) {
      console.log(
        `VAD model exists but has wrong size (${stats.size} vs ${expectedSize}), re-downloading`,
      )
    }
  }

  const url = getVadModelDownloadUrl()

  if (printOutput) {
    console.log(`Downloading Silero VAD model`)
  }

  await downloadFile({
    url,
    destPath: modelPath,
    expectedSize,
    printOutput,
    onProgress,
    signal,
  })

  if (printOutput) {
    console.log(`VAD model installed successfully`)
  }

  return modelPath
}

export interface EnsureInstalledOptions {
  model?: WhisperModel | undefined
  variant?: BuildVariant | undefined
  modelDir?: string | undefined
  printOutput?: boolean | undefined
  force?: boolean | undefined
  signal?: AbortSignal | null | undefined
}

export async function ensureWhisperInstalled(
  options: EnsureInstalledOptions = {},
): Promise<{
  installDir: string
  modelPath: string | null
}> {
  const { model, variant, printOutput = false, force = false, signal } = options

  const installDir = await installBinary({
    variant,
    printOutput,
    force,
    signal,
  })

  let modelPath: string | null = null
  if (model) {
    modelPath = await installModel({
      model,
      modelDir: options.modelDir,
      printOutput,
      force,
      signal,
    })
  }

  return { installDir, modelPath }
}
