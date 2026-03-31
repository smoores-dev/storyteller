import { execSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import z from "zod"

import { type RecognitionEngine } from "../api/Recognition.ts"
import { getAppDataDir } from "../utilities/FileSystem.ts"

export const WHISPER_CPP_UPSTREAM_VERSION = "1.8.3"
export const WHISPER_CPP_PATCH_LEVEL = 2
export const WHISPER_CPP_VERSION = `${WHISPER_CPP_UPSTREAM_VERSION}-st.${WHISPER_CPP_PATCH_LEVEL}`
export const WHISPER_MODEL_VERSION = "1.0.0"
export const SILERO_VAD_VERSION = "6.2.0"

export const GITLAB_PROJECT_PATH = "storyteller-platform/storyteller"
export const GITLAB_PROJECT_ID = "67994333"
export const GITLAB_WHIPSER_ML_ID = "2007349"

export const BUILD_VARIANTS = [
  "darwin-arm64-coreml",
  "darwin-arm64-cpu",
  "darwin-x64-cpu",
  "linux-x64-blas",
  "linux-x64-cpu",
  "linux-x64-cuda-13.1.0",
  "linux-x64-cuda-12.9.0",
  "linux-x64-cuda-11.8.0",
  "linux-x64-sycl",
  "linux-x64-vulkan",
  "linux-x64-rocm",
  "linux-x64-cuda-13.1.0-legacy",
  "linux-x64-cuda-12.9.0-legacy",
  "linux-x64-cuda-11.8.0-legacy",
  "linux-x64-sycl-legacy",
  "linux-x64-vulkan-legacy",
  "linux-x64-rocm-legacy",
  "linux-x64-blas-legacy",
  "linux-x64-cpu-legacy",
  "linux-arm64-cpu",
  "windows-x64-cpu",
  "windows-x64-cuda-13.1.0",
  "windows-x64-cuda-12.9.0",
  "windows-x64-cuda-11.8.0",
  "windows-x64-vulkan",
] as const

export type BuildVariant = (typeof BUILD_VARIANTS)[number]

type Platform = "darwin" | "linux" | "win32"
type Arch = "arm64" | "x64"

interface PlatformInfo {
  platform: Platform
  arch: Arch
}

function getVariantPlatformInfo(variant: BuildVariant): PlatformInfo {
  if (variant.startsWith("darwin-arm64")) {
    return { platform: "darwin", arch: "arm64" }
  }
  if (variant.startsWith("darwin-x64")) {
    return { platform: "darwin", arch: "x64" }
  }
  if (variant.startsWith("linux-arm64")) {
    return { platform: "linux", arch: "arm64" }
  }
  if (variant.startsWith("linux-x64")) {
    return { platform: "linux", arch: "x64" }
  }
  if (variant.startsWith("windows-arm64")) {
    return { platform: "win32", arch: "arm64" }
  }
  if (variant.startsWith("windows-x64")) {
    return { platform: "win32", arch: "x64" }
  }
  throw new Error(`Unknown variant: ${variant}`)
}

export function isVariantCompatibleWithCurrentPlatform(
  variant: BuildVariant,
): boolean {
  const currentPlatform = process.platform as Platform
  const currentArch = process.arch as Arch
  const variantInfo = getVariantPlatformInfo(variant)
  return (
    variantInfo.platform === currentPlatform && variantInfo.arch === currentArch
  )
}

export function getCompatibleVariants(): BuildVariant[] {
  return BUILD_VARIANTS.filter(isVariantCompatibleWithCurrentPlatform)
}

export const WHISPER_MODELS = [
  "tiny",
  "tiny.en",
  "tiny-q5_1",
  "tiny.en-q5_1",
  "tiny-q8_0",
  "base",
  "base.en",
  "base-q5_1",
  "base.en-q5_1",
  "base-q8_0",
  "small",
  "small.en",
  "small-q5_1",
  "small.en-q5_1",
  "small-q8_0",
  "medium",
  "medium.en",
  "medium-q5_0",
  "medium.en-q5_0",
  "medium-q8_0",
  "large-v1",
  "large-v2",
  "large-v2-q5_0",
  "large-v2-q8_0",
  "large-v3",
  "large-v3-q5_0",
  "large-v3-turbo",
  "large-v3-turbo-q5_0",
  "large-v3-turbo-q8_0",
] as const

export const RECOGNITION_ENGINES = [
  "whisper.cpp",
  "whisper-server",
  "google-cloud",
  "microsoft-azure",
  "amazon-transcribe",
  "openai-cloud",
  "deepgram",
] as const satisfies RecognitionEngine[]

export type WhisperModel = (typeof WHISPER_MODELS)[number]

export const MODEL_SIZES: Record<WhisperModel | "silero-vad", number> = {
  tiny: 77691713,
  "tiny-q5_1": 32152673,
  "tiny.en": 77704715,
  "tiny.en-q5_1": 32166155,
  "tiny-q8_0": 43537433,
  base: 147951465,
  "base.en": 147964211,
  "base-q5_1": 59707625,
  "base.en-q5_1": 59721011,
  "base-q8_0": 81768585,
  small: 487601967,
  "small.en": 487614201,
  "small-q5_1": 190085487,
  "small.en-q5_1": 190098681,
  "small-q8_0": 264464607,
  medium: 1533763059,
  "medium.en": 1533774781,
  "medium-q5_0": 539212467,
  "medium.en-q5_0": 539225533,
  "medium-q8_0": 823369779,
  "large-v1": 3094623691,
  "large-v2": 3094623691,
  "large-v2-q5_0": 1080732091,
  "large-v2-q8_0": 1656129691,
  "large-v3": 3095033483,
  "large-v3-q5_0": 1081140203,
  "large-v3-turbo": 1624555275,
  "large-v3-turbo-q5_0": 574041195,
  "large-v3-turbo-q8_0": 874188075,
  "silero-vad": 884595,
}

export function getBinaryDownloadUrl(variant: BuildVariant): string {
  const filename = `whisper-cpp-${variant}.tar.gz`
  return `https://gitlab.com/api/v4/projects/${GITLAB_PROJECT_ID}/packages/generic/whisper-cpp/${WHISPER_CPP_VERSION}/${filename}`
}

export function getModelDownloadUrl(model: WhisperModel): string {
  const filename = `ggml-${model}.bin`
  return `https://gitlab.com/api/v4/projects/${GITLAB_PROJECT_ID}/packages/ml_models/${GITLAB_WHIPSER_ML_ID}/files/${filename}`
}

export function getCoremlModelDownloadUrl(model: WhisperModel): string {
  const filename = `ggml-${model}-encoder.mlmodelc.tar.gz`
  return `https://gitlab.com/api/v4/projects/${GITLAB_PROJECT_ID}/packages/ml_models/${GITLAB_WHIPSER_ML_ID}/files/coreml/${filename}`
}

export function getVadModelDownloadUrl(): string {
  return `https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v${SILERO_VAD_VERSION}.bin`
}

export function getWhisperBaseDir(): string {
  return path.join(
    getAppDataDir("ghost-story"),
    "whisper-cpp",
    WHISPER_CPP_VERSION,
  )
}

export function getInstallDir(variant?: BuildVariant): string {
  const baseDir = getWhisperBaseDir()
  const resolved = variant ?? resolveVariant()
  return path.join(baseDir, resolved)
}

/**
 * scans the install directory to find which variant is currently installed
 */
export function getInstalledVariant(): BuildVariant | null {
  const baseDir = getWhisperBaseDir()
  if (!existsSync(baseDir)) {
    return null
  }

  const entries = readdirSync(baseDir, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const variant = entry.name as BuildVariant
    if (!BUILD_VARIANTS.includes(variant)) {
      continue
    }

    const execPath = getWhisperExecutablePath(path.join(baseDir, variant))
    if (existsSync(execPath)) {
      return variant
    }
  }

  return null
}

export function getModelDir(): string {
  return path.join(getAppDataDir("ghost-story"), "models")
}

export function getWhisperExecutablePath(installDir?: string): string {
  const dir = installDir ?? getInstallDir()
  const isWindows = os.platform() === "win32"
  const executable = isWindows ? "whisper-cli.exe" : "whisper-cli"
  return path.join(dir, "bin", executable)
}

export function getVadExecutablePath(installDir?: string): string {
  const dir = installDir ?? getInstallDir()
  const isWindows = os.platform() === "win32"
  const executable = isWindows
    ? "vad-speech-segments.exe"
    : "vad-speech-segments"
  return path.join(dir, "bin", executable)
}

export function getWhisperServerExecutablePath(installDir?: string): string {
  const dir = installDir ?? getInstallDir()
  const isWindows = os.platform() === "win32"
  const executable = isWindows ? "whisper-server.exe" : "whisper-server"
  return path.join(dir, "bin", executable)
}

export function getModelPath(model: WhisperModel, modelDir?: string): string {
  const dir = modelDir ?? getModelDir()
  return path.join(dir, `ggml-${model}.bin`)
}

export function getCoremlModelPath(
  model: WhisperModel,
  modelDir?: string,
): string {
  const dir = modelDir ?? getModelDir()
  return path.join(dir, `ggml-${model}-encoder.mlmodelc`)
}

export function needsCoremlModel(variant?: BuildVariant): boolean {
  const v = variant ?? getInstalledVariant() ?? detectPlatform()
  return v.includes("coreml")
}

export function getVadModelPath(modelDir?: string): string {
  const dir = modelDir ?? getModelDir()
  return path.join(dir, `ggml-silero-v${SILERO_VAD_VERSION}.bin`)
}

function hasCuda(): boolean {
  try {
    execSync("nvidia-smi", { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

function hasRocm(): boolean {
  try {
    execSync("rocminfo", { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

function hasVulkan(): boolean {
  try {
    execSync("vulkaninfo --summary", { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

function hasSycl(): boolean {
  try {
    execSync("sycl-ls", { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

interface CpuCapabilities {
  avx2: boolean
  fma: boolean
}

let cpuCapabilitiesCache: CpuCapabilities | null = null

function getLinuxCpuCapabilities(): CpuCapabilities {
  if (cpuCapabilitiesCache) return cpuCapabilitiesCache

  try {
    const cpuinfo = readFileSync("/proc/cpuinfo", "utf-8")
    const flagsMatch = cpuinfo.match(/^flags\s*:\s*(.+)$/m)
    if (!flagsMatch?.[1]) {
      cpuCapabilitiesCache = { avx2: false, fma: false }
      return cpuCapabilitiesCache
    }
    const flags = flagsMatch[1].split(/\s+/)
    cpuCapabilitiesCache = {
      avx2: flags.includes("avx2"),
      fma: flags.includes("fma"),
    }
  } catch {
    // if /proc/cpuinfo is unreadable, assume modern cpu
    cpuCapabilitiesCache = { avx2: true, fma: true }
  }

  return cpuCapabilitiesCache
}

export function applyLegacyCpuFallback(variant: BuildVariant): BuildVariant {
  if (process.platform !== "linux") return variant
  if (process.arch !== "x64") return variant

  const caps = getLinuxCpuCapabilities()
  if (caps.avx2 && caps.fma) return variant

  console.warn(
    `CPU lacks ${[!caps.avx2 && "AVX2", !caps.fma && "FMA"].filter(Boolean).join(" and ")} support. ` +
      `Falling back to linux-x64-cpu-legacy variant.`,
  )
  return `${variant}-legacy` as BuildVariant
}

/**
 * neturns the variant configured via STORYTELLER_WHISPER_VARIANT env var.
 * set by the Docker build process and should be the primary source
 * of truth for which whisper.cpp binary to use.
 */
export function getConfiguredVariant(): BuildVariant | null {
  const envVariant = process.env["STORYTELLER_WHISPER_VARIANT"]
  if (!envVariant || envVariant === "") {
    return null
  }

  if (!isValidVariant(envVariant)) {
    console.warn(
      `STORYTELLER_WHISPER_VARIANT="${envVariant}" is not a valid variant. ` +
        `Valid variants: ${BUILD_VARIANTS.join(", ")}`,
    )
    return null
  }

  return envVariant
}

/**
 * Detects the platform by checking for available GPU runtimes.
 * This should only be used as a fallback when no variant is configured.
 * Note: CUDA detection cannot determine version, so it defaults to 13.1.0.
 */
export function detectPlatform(): BuildVariant {
  const platform = process.platform
  const arch = process.arch

  if (platform === "darwin") {
    return arch === "arm64" ? "darwin-arm64-coreml" : "darwin-x64-cpu"
  }

  if (platform === "linux") {
    if (hasCuda()) {
      // we can detect CUDA presence but not version, default to latest
      console.warn(
        "CUDA detected via nvidia-smi but no STORYTELLER_WHISPER_VARIANT configured. " +
          "Defaulting to cuda-13.1.0. Set STORYTELLER_WHISPER_VARIANT for correct version.",
      )
      return "linux-x64-cuda-13.1.0"
    }
    if (hasRocm()) {
      return "linux-x64-rocm"
    }
    if (hasSycl()) {
      return "linux-x64-sycl"
    }
    if (hasVulkan()) {
      return "linux-x64-vulkan"
    }
    return arch === "arm64" ? "linux-arm64-cpu" : "linux-x64-cpu"
  }

  if (platform === "win32") {
    if (hasCuda()) {
      console.warn(
        "CUDA detected via nvidia-smi but no STORYTELLER_WHISPER_VARIANT configured. " +
          "Defaulting to cuda-13.1.0. Set STORYTELLER_WHISPER_VARIANT for correct version.",
      )
      return "windows-x64-cuda-13.1.0"
    }
    if (hasVulkan()) {
      return "windows-x64-vulkan"
    }
    return "windows-x64-cpu"
  }

  throw new Error(`Unsupported platform: ${platform}-${arch}`)
}

/**
 * Resolves which variant to use with the following priority:
 * 1. Explicitly passed variant argument
 * 2. STORYTELLER_WHISPER_VARIANT environment variable (set by Docker)
 * 3. Already installed variant (from filesystem)
 * 4. Platform detection (last resort)
 */
export function resolveVariant(requestedVariant?: BuildVariant): BuildVariant {
  if (requestedVariant) {
    return applyLegacyCpuFallback(requestedVariant)
  }

  const configured = getConfiguredVariant()
  if (configured) {
    return applyLegacyCpuFallback(configured)
  }

  const installed = getInstalledVariant()
  if (installed) {
    return applyLegacyCpuFallback(installed)
  }

  console.warn(
    "No variant configured or installed. Falling back to platform detection.",
  )
  return applyLegacyCpuFallback(detectPlatform())
}

export function isValidModel(model: string): model is WhisperModel {
  return WHISPER_MODELS.includes(model as WhisperModel)
}

export function isValidVariant(variant: string): variant is BuildVariant {
  return BUILD_VARIANTS.includes(variant as BuildVariant)
}

export const cliConfigSchema = z.object({
  lastUsedModel: z.enum(WHISPER_MODELS).nullable(),
  installedVariant: z.enum(BUILD_VARIANTS).nullable(),
})

/**
 * Only to be used by the CLI, not the API/programmatic use.
 * Mostly to remember the last used model and variant.
 */
export type CLIConfig = z.infer<typeof cliConfigSchema>

export function readConfig(): CLIConfig {
  const configPath = path.join(getAppDataDir("ghost-story"), "config.json")
  if (!existsSync(configPath)) {
    return {
      lastUsedModel: null,
      installedVariant: null,
    }
  }
  const config = JSON.parse(readFileSync(configPath, "utf-8")) as CLIConfig

  const parsed = cliConfigSchema.safeParse(config)
  if (!parsed.success) {
    console.error(`Invalid config: ${parsed.error.message}`)
    console.warn("Resetting config...")
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          lastUsedModel: null,
          installedVariant: null,
        },
        null,
        2,
      ),
    )
    return {
      lastUsedModel: null,
      installedVariant: null,
    }
  }

  return config
}

export function writeConfig(config: Partial<CLIConfig>): void {
  const currentConfig = readConfig()
  const validated = cliConfigSchema.parse({ ...currentConfig, ...config })
  writeFileSync(
    path.join(getAppDataDir("ghost-story"), "config.json"),
    JSON.stringify(validated, null, 2),
  )
}
