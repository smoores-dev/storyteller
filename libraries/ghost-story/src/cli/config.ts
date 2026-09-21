import { execSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import z from "zod"

import {
  type Arch,
  BUILD_VARIANTS,
  type BuildVariant,
  type Platform,
  type ResolvedCtcDevice,
  SILERO_VAD_VERSION,
  WHISPER_CPP_VERSION,
  WHISPER_MODELS,
  type CtcDevice,
  type WhisperModel,
} from "../constants.ts"
import { getAppDataDir } from "../utilities/FileSystem.ts"

export const GITLAB_PROJECT_PATH = "storyteller-platform/storyteller"
export const GITLAB_PROJECT_ID = "67994333"
export const GITLAB_WHIPSER_ML_ID = "2007349"

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
  if (process.env["WHISPER_CPP_PATH"] !== undefined)
    return process.env["WHISPER_CPP_PATH"]
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
  if (variant.endsWith("-legacy")) return variant

  const caps = getLinuxCpuCapabilities()
  if (caps.avx2 && caps.fma) return variant

  const legacyVariant = `${variant}-legacy` as BuildVariant
  console.warn(
    `CPU lacks ${[!caps.avx2 && "AVX2", !caps.fma && "FMA"].filter(Boolean).join(" and ")} support. ` +
      `Falling back to ${legacyVariant} variant.`,
  )
  return legacyVariant
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

export interface CtcDeviceCapabilities {
  available: ResolvedCtcDevice[]
  default: ResolvedCtcDevice
}

const CTC_DEVICE_ORDER = ["cuda", "mlx", "webgpu", "cpu"] as const

export function ctcDeviceCapabilities(
  variant: string | null | undefined,
): CtcDeviceCapabilities {
  const variantName = variant ?? ""
  const cpuVariant = variantName.includes("cpu") || variantName.includes("blas")
  const cuda = process.platform === "linux" && process.arch === "x64"
  const mlx = process.platform === "darwin" && process.arch === "arm64"
  const webgpu =
    !(process.platform === "linux" && process.arch === "arm64") && !cpuVariant

  const available = CTC_DEVICE_ORDER.filter(
    (device) =>
      device === "cpu" ||
      (device === "cuda" && cuda) ||
      (device === "mlx" && mlx) ||
      (device === "webgpu" && webgpu),
  )

  const gpuVariant =
    variantName.includes("cuda") ||
    variantName.includes("rocm") ||
    variantName.includes("sycl") ||
    variantName.includes("vulkan") ||
    variantName.includes("coreml")

  const preferred: ResolvedCtcDevice =
    cuda && variantName.includes("cuda") && !variantName.includes("cuda-11")
      ? "cuda"
      : mlx
        ? "mlx"
        : gpuVariant && webgpu
          ? "webgpu"
          : "cpu"

  return {
    available: [preferred, ...available.filter((d) => d !== preferred)],
    default: preferred,
  }
}

export function resolveCtcDevice(
  requested: CtcDevice | null | undefined,
  variant: string | null | undefined,
): ResolvedCtcDevice {
  const capabilities = ctcDeviceCapabilities(variant)
  if (
    requested &&
    requested !== "auto" &&
    capabilities.available.includes(requested)
  ) {
    return requested
  }
  return capabilities.default
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
