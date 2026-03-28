import { spawn } from "node:child_process"
import fs, { existsSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import { ensureDir } from "fs-extra"

import {
  type AudioFormat,
  type AudioSource,
  type RawAudioInput,
  getAudioDuration,
  isAudioSource,
  normalizeToAudioSource,
  prepareWavForService,
  toFilePath,
} from "../audio/index.ts"
import {
  type WhisperModel,
  getInstallDir,
  getModelDir,
  getModelPath as getModelPathFromConfig,
  getWhisperExecutablePath,
} from "../cli/config.ts"
import { installBinary, installModel } from "../cli/install.ts"
import type { Timeline } from "../utilities/Timeline.ts"
import type { Timing } from "../utilities/Timing.ts"
import {
  type WhisperCppTranscriptionSegment,
  calculateEffectiveProcessors,
  calculateWhisperSplits,
  extractCorrectedTimeline,
  parseWhisperCppOutput,
} from "../utilities/WhisperTimeline.ts"

export type InputPreference = "file"
export const inputPreference: InputPreference = "file"

export const Languages = [
  "af",
  "am",
  "ar",
  "as",
  "az",
  "ba",
  "be",
  "bg",
  "bn",
  "bo",
  "br",
  "bs",
  "ca",
  "cs",
  "cy",
  "da",
  "de",
  "el",
  "en",
  "es",
  "et",
  "eu",
  "fa",
  "fi",
  "fo",
  "fr",
  "gl",
  "gu",
  "ha",
  "haw",
  "he",
  "hi",
  "hr",
  "ht",
  "hu",
  "hy",
  "id",
  "is",
  "it",
  "ja",
  "jw",
  "ka",
  "kk",
  "km",
  "kn",
  "ko",
  "la",
  "lb",
  "ln",
  "lo",
  "lt",
  "lv",
  "mg",
  "mi",
  "mk",
  "ml",
  "mn",
  "mr",
  "ms",
  "mt",
  "my",
  "ne",
  "nl",
  "nn",
  "no",
  "oc",
  "pa",
  "pl",
  "ps",
  "pt",
  "ro",
  "ru",
  "sa",
  "sd",
  "si",
  "sk",
  "sl",
  "sn",
  "so",
  "sq",
  "sr",
  "su",
  "sv",
  "sw",
  "ta",
  "te",
  "tg",
  "th",
  "tk",
  "tl",
  "tr",
  "tt",
  "uk",
  "ur",
  "uz",
  "vi",
  "yi",
  "yo",
  "zh",
] as const

export type Language = (typeof Languages)[number]

export type { WhisperModel }

export interface WhisperCppOptions {
  model: WhisperModel
  modelDir?: string
  installDir?: string
  language?: Language
  processors?: number
  threads?: number
  flashAttention?: boolean
  suppressNonSpeechTokens?: boolean
  tokenLevelTimestamps?: boolean
  printOutput?: boolean
  autoInstall?: boolean
  onStart?: () => void
  onProgress?: (progress: number) => void
  inputFormat?: AudioFormat
}

const defaultOptions: Required<
  Pick<
    WhisperCppOptions,
    | "processors"
    | "threads"
    | "flashAttention"
    | "suppressNonSpeechTokens"
    | "tokenLevelTimestamps"
    | "printOutput"
    | "autoInstall"
    | "model"
  >
> = {
  processors: 1,
  threads: 4,
  flashAttention: true,
  suppressNonSpeechTokens: true,
  tokenLevelTimestamps: true,
  printOutput: false,
  model: "tiny.en",
  autoInstall: true,
}

const acceptedFormats: AudioFormat[] = ["wav", "flac", "ogg", "mp3"]

export async function recognize(
  input: RawAudioInput | AudioSource,
  timing: Timing,
  options: WhisperCppOptions,
  signal?: AbortSignal | null,
): Promise<RecognitionResult> {
  const opts = { ...defaultOptions, ...options }
  const modelDir = opts.modelDir ?? getModelDir()
  const installDir = opts.installDir ?? getInstallDir()

  const source = isAudioSource(input)
    ? input
    : normalizeToAudioSource(input, opts.inputFormat)

  await ensureDir(modelDir)

  const doInstall = async () => {
    await ensureWhisperCppInstalled()
    await ensureModelDownloaded(modelDir, opts.model, opts.printOutput)
  }

  if (opts.autoInstall) {
    await timing.timeAsync("installation", doInstall)
  }

  const conversionNeeded = !acceptedFormats.includes(source.format)
  timing.setMetadata("conversionRequired", conversionNeeded)
  timing.setMetadata("targetFormat", conversionNeeded ? "wav" : source.format)

  const doPrepare = async () => {
    if (!conversionNeeded) return { source, cleanup: async () => {} }
    return prepareWavForService(source, { sampleRate: 16000, channels: 1 })
  }

  const prepared = await timing.timeAsync("conversion", doPrepare)

  try {
    const inputPath = toFilePath(prepared.source)
    if (!inputPath) {
      throw new Error(
        "whisper.cpp requires a file path. The audio could not be prepared as a file.",
      )
    }

    if (!existsSync(inputPath)) {
      throw new Error(`Input file does not exist: ${inputPath}`)
    }

    // get audio duration to calculate effective processor count and split boundaries
    const audioDuration = await getAudioDuration(inputPath)
    const effectiveProcessors = calculateEffectiveProcessors(
      audioDuration,
      opts.processors,
    )

    opts.onStart?.()
    const transcription = await timing.timeAsync("transcription", () =>
      transcribe({
        inputPath,
        model: opts.model,
        installDir,
        modelFolder: modelDir,
        language: opts.language ?? null,
        tokenLevelTimestamps: opts.tokenLevelTimestamps,
        printOutput: opts.printOutput,
        flashAttention: opts.flashAttention,
        suppressNonSpeechTokens: opts.suppressNonSpeechTokens,
        processors: effectiveProcessors,
        threads: opts.threads,
        onProgress: opts.onProgress ?? null,
        signal: signal ?? null,
      }),
    )

    const rawSegments = parseWhisperCppOutput(transcription.transcription)

    // calculate split boundaries in order to correct weird timestamps
    // in multi-processor transcription
    const splitBoundaries =
      effectiveProcessors > 1
        ? calculateWhisperSplits(audioDuration, effectiveProcessors)
        : []

    const timeline = extractCorrectedTimeline(rawSegments, {
      splitBoundaries: splitBoundaries.length > 0 ? splitBoundaries : undefined,
    })
    const transcript = transcription.transcription
      .map((s) => s.text)
      .join("")
      .trim()

    return {
      transcript,
      timeline,
      language: transcription.result.language,
    }
  } finally {
    await prepared.cleanup()
  }
}

export async function ensureWhisperCppInstalled(): Promise<void> {
  await installBinary({ printOutput: false })
}

export async function ensureModelDownloaded(
  modelDir: string,
  modelName: WhisperModel,
  printOutput: boolean,
): Promise<void> {
  const modelPath = getModelPathFromConfig(modelName, modelDir)

  if (existsSync(modelPath)) {
    return
  }

  await installModel({
    model: modelName,
    modelDir,
    printOutput,
  })
}

function getModelPath(folder: string, model: WhisperModel): string {
  return path.join(folder, `ggml-${model}.bin`)
}

interface TranscribeOptions {
  inputPath: string
  model: WhisperModel
  installDir: string
  modelFolder: string
  language: Language | null
  tokenLevelTimestamps: boolean
  printOutput: boolean
  flashAttention: boolean
  suppressNonSpeechTokens: boolean
  processors: number
  threads: number
  onProgress: ((progress: number) => void) | null
  signal: AbortSignal | null
}

async function transcribe(
  options: TranscribeOptions,
): Promise<TranscriptionJson> {
  const {
    inputPath,
    model,
    installDir,
    modelFolder,
    language,
    tokenLevelTimestamps,
    printOutput,
    flashAttention,
    suppressNonSpeechTokens,
    processors,
    threads,
    onProgress,
    signal,
  } = options

  const executable = getWhisperExecutablePath(installDir)
  const modelPath = getModelPath(modelFolder, model)

  if (!existsSync(executable)) {
    throw new Error(`Whisper executable not found at ${executable}`)
  }

  if (!existsSync(modelPath)) {
    throw new Error(`Model not found at ${modelPath}`)
  }

  const tmpDir = path.join(os.tmpdir(), "ghost-story-whisper")
  await ensureDir(tmpDir)
  const tmpJsonPath = path.join(tmpDir, `transcription-${Date.now()}`)

  const args = buildTranscribeArgs({
    inputPath,
    modelPath,
    outputPath: tmpJsonPath,
    model,
    language,
    tokenLevelTimestamps,
    flashAttention,
    suppressNonSpeechTokens,
    processors,
    threads,
  })

  try {
    const outputPath = await runWhisperProcess({
      executable,
      args,
      cwd: installDir,
      printOutput,
      onProgress,
      signal,
      expectedOutputPath: `${tmpJsonPath}.json`,
    })

    const json = JSON.parse(
      await fs.promises.readFile(outputPath, "utf8"),
    ) as TranscriptionJson

    fs.promises.unlink(outputPath).catch(() => {})

    return json
  } catch (error) {
    await fs.promises.unlink(`${tmpJsonPath}.json`).catch(() => {})
    throw error
  }
}

interface BuildArgsOptions {
  inputPath: string
  modelPath: string
  outputPath: string
  model: WhisperModel
  language: Language | null
  tokenLevelTimestamps: boolean
  flashAttention: boolean
  suppressNonSpeechTokens: boolean
  processors: number
  threads: number
}

function buildTranscribeArgs(options: BuildArgsOptions): string[] {
  const args: (string | string[] | null)[] = [
    "--file",
    options.inputPath,
    "--output-file",
    options.outputPath,
    "--output-json-full",
    "--model",
    options.modelPath,
    "--print-progress",
    options.language ? ["--language", options.language.toLowerCase()] : null,
    options.flashAttention ? ["--flash-attn"] : null,
    options.suppressNonSpeechTokens ? ["--suppress-nst"] : null,
    ["--processors", String(options.processors)],
    ["--threads", String(options.threads)],
  ]

  return args.flat().filter((arg): arg is string => arg !== null)
}

interface RunProcessOptions {
  executable: string
  args: string[]
  cwd: string
  printOutput: boolean
  onProgress: ((progress: number) => void) | null
  signal: AbortSignal | null
  expectedOutputPath: string
}

function runWhisperProcess(options: RunProcessOptions): Promise<string> {
  const {
    executable,
    args,
    cwd,
    printOutput,
    onProgress,
    signal,
    expectedOutputPath,
  } = options

  if (signal?.aborted) {
    return Promise.reject(new Error("Signal aborted"))
  }

  return new Promise((resolve, reject) => {
    const task = spawn(executable, args, { cwd, signal: signal ?? undefined })
    let output = ""

    const handleData = (data: Buffer) => {
      const str = data.toString("utf-8")
      output += str

      if (str.includes("progress =")) {
        const match = str.match(/progress\s*=\s*([\d.]+)/)
        if (match?.[1]) {
          onProgress?.(parseFloat(match[1]) / 100)
        }
      }
    }

    task.stdout.on("data", (data: Buffer) => {
      handleData(data)
      if (printOutput) {
        process.stdout.write(data)
      }
    })

    task.stderr.on("data", (data: Buffer) => {
      handleData(data)
      if (printOutput) {
        process.stderr.write(data)
      }
    })

    task.on("exit", (code, exitSignal) => {
      if (existsSync(expectedOutputPath)) {
        onProgress?.(1)
        resolve(expectedOutputPath)
        return
      }

      if (exitSignal) {
        reject(new Error(`Process killed with signal ${exitSignal}: ${output}`))
        return
      }

      if (output.includes("must be 16 kHz")) {
        reject(
          new Error(
            "Audio file must be 16 kHz. Convert your audio to 16-bit, 16KHz WAV format.",
          ),
        )
        return
      }

      reject(new Error(`Transcription failed (exit code ${code}): ${output}`))
    })

    task.on("error", (err) => {
      reject(new Error(`Failed to start whisper process: ${err.message}`))
    })
  })
}

export interface RecognitionResult {
  transcript: string
  timeline: Timeline
  language?: string
}

interface TranscriptionJson {
  systeminfo: string
  model: {
    type: string
    multilingual: boolean
    vocab: number
    audio: { ctx: number; state: number; head: number; layer: number }
    text: { ctx: number; state: number; head: number; layer: number }
    mels: number
    ftype: number
  }
  params: { model: string; language: string; translate: boolean }
  result: { language: string }
  transcription: WhisperCppTranscriptionSegment[]
}

export type WhisperCppModelId =
  | "tiny"
  | "tiny-q5_1"
  | "tiny.en"
  | "tiny.en-q5_1"
  | "tiny.en-q8_0"
  | "base"
  | "base-q5_1"
  | "base.en"
  | "base.en-q5_1"
  | "small"
  | "small-q5_1"
  | "small.en"
  | "small.en-q5_1"
  | "medium"
  | "medium-q5_0"
  | "medium.en"
  | "medium.en-q5_0"
  | "large"
  | "large-v1"
  | "large-v2"
  | "large-v2-q5_0"
  | "large-v3"
  | "large-v3-q5_0"
  | "large-v3-turbo"
  | "large-v3-turbo-q5_0"
