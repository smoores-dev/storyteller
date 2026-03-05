import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import * as os from "node:os"
import { basename, extname, join, resolve } from "node:path"

import { AsyncSemaphore } from "@esfx/async-semaphore"
import { type Logger } from "pino"

import { isAudioFile } from "@storyteller-platform/audiobook"
import {
  type BuildVariant,
  type RecognitionEngine,
  type TimingAggregator,
  type WhisperCppOptions,
  type WhisperModel,
  applyLegacyCpuFallback,
  createAggregator,
  ensureWhisperInstalled,
  formatSingleReport,
  recognize,
} from "@storyteller-platform/ghost-story"

type WhisperCpuOverride = "blas" | "cpu" | null

export interface TranscribeOptions {
  onProgress?: ((progress: number) => void) | null | undefined
  parallelism?: number | null | undefined
  signal?: AbortSignal | null | undefined
  engine?: RecognitionEngine | null | undefined
  model?: WhisperModel | null | undefined
  processors?: number | null | undefined
  threads?: number | null | undefined
  whisperCpuOverride?: WhisperCpuOverride | null | undefined
  logger?: Logger | null | undefined
  googleCloudApiKey?: string | null | undefined
  azureServiceRegion?: string | null | undefined
  azureSubscriptionKey?: string | null | undefined
  amazonTranscribeRegion?: string | null | undefined
  amazonTranscribeAccessKeyId?: string | null | undefined
  amazonTranscribeSecretAccessKey?: string | null | undefined
  amazonTranscribeBucketName?: string | null | undefined
  openAiApiKey?: string | null | undefined
  openAiOrganization?: string | null | undefined
  openAiBaseUrl?: string | null | undefined
  openAiModelName?: string | null | undefined
  whisperServerUrl?: string | null | undefined
  whisperServerApiKey?: string | null | undefined
  deepgramApiKey?: string | null | undefined
  deepgramModel?: string | null | undefined
}

export async function transcribe(
  input: string,
  output: string,
  locale: Intl.Locale,
  options: TranscribeOptions,
): Promise<TimingAggregator> {
  if (process.env["DEBUG_TRANSCRIBE"] === "true") {
    const inspector = await import("node:inspector")
    inspector.open(9231, "0.0.0.0", true)
  }

  const semaphore = new AsyncSemaphore(options.parallelism ?? 1)

  const controller = new AbortController()
  const signal = AbortSignal.any([
    ...(options.signal ? [options.signal] : []),
    controller.signal,
  ])

  await mkdir(output, { recursive: true })

  const allFiles = await readdir(input, { recursive: true })
  const filenames = allFiles.filter((f) => isAudioFile(f))

  if (!filenames.length) {
    throw new Error(
      `Failed to transcribe audio: found no audio files in ${input}`,
    )
  }

  const engine = options.engine ?? "whisper.cpp"
  const model = options.model ?? "tiny.en"

  if (engine === "whisper.cpp") {
    await ensureWhisperInstalled({
      model,
      printOutput: ["debug", "info"].includes(
        options.logger?.level ?? "silent",
      ),
      signal,
    })
  }

  const transcriptions: string[] = []

  // Prevent incorrect type narrowing
  function aborted() {
    return signal.aborted
  }

  const perFileProgress = new Map<string, number>()

  const timing = createAggregator()
  timing.setMetadata("engine", engine)
  timing.setMetadata("parallelization", options.parallelism ?? 1)
  timing.setMetadata("processors", options.processors ?? 1)
  timing.setMetadata("threads", options.threads ?? 4)

  await Promise.all(
    filenames
      .map(async (filename) => {
        if (aborted()) throw new Error("Aborted")

        const filepath = join(input, filename)
        const transcriptionFilepath = join(
          output,
          `${basename(filename, extname(filename))}.json`,
        )

        try {
          await readFile(transcriptionFilepath, {
            encoding: "utf-8",
            signal,
          })

          options.logger?.info(`Found existing transcription for ${filepath}`)
          transcriptions.push(transcriptionFilepath)
        } catch {
          //
        }

        if (aborted()) throw new Error("Aborted")

        using stack = new DisposableStack()
        stack.defer(() => {
          semaphore.release()
        })

        await semaphore.wait()

        function onFileProgress(progress: number) {
          perFileProgress.set(filename, progress)
          const updatedProgress =
            Array.from(perFileProgress.values()).reduce((acc, p) => acc + p) /
            filenames.length
          options.logger?.info(
            `Progress: ${Math.floor(updatedProgress * 100)}%`,
          )
          options.onProgress?.(updatedProgress)
        }

        const transcription = await transcribeFile(filepath, locale, {
          ...options,
          signal,
          engine,
          model,
          processors: options.processors ?? 1,
          threads: options.threads ?? 4,
          onProgress: onFileProgress,
        })

        options.logger?.info(
          formatSingleReport(
            transcription.timing,
            `Transcription Timing Report for ${filepath}`,
          ),
        )
        timing.add(transcription.timing)

        await writeFile(
          transcriptionFilepath,
          JSON.stringify({
            transcript: transcription.transcript,
            timeline: transcription.timeline,
          }),
          { signal },
        )

        transcriptions.push(transcriptionFilepath)
        options.onProgress?.((transcriptions.length + 1) / filenames.length)
      })
      .map((p) =>
        p.catch((e: unknown) => {
          controller.abort(e)
          throw e
        }),
      ),
  )

  return timing
}

export interface TranscribeFileOptions
  extends Omit<
    TranscribeOptions,
    "engine" | "model" | "processors" | "threads"
  > {
  engine: RecognitionEngine
  model: WhisperModel
  processors: number
  threads: number
}

export async function transcribeFile(
  input: string,
  locale: Intl.Locale,
  options: TranscribeFileOptions,
) {
  const audioFilepath = resolve(process.cwd(), input)

  const sharedOptions = {
    signal: options.signal,
    language: locale.language,
  }

  switch (options.engine) {
    case "whisper.cpp": {
      const fallbackVariant = getCpuOverrideVariant(
        options.whisperCpuOverride ?? null,
      )

      const whisperOptions = await ensureWhisperInstalled({
        model: options.model,
        variant: fallbackVariant,
        printOutput: ["debug", "info"].includes(
          options.logger?.level ?? "silent",
        ),
        signal: options.signal,
      })

      options.logger?.info(`Transcribing audio file ${audioFilepath}`)

      return recognize(audioFilepath, {
        engine: options.engine,
        options: {
          flashAttention: true,
          model: getWhisperCppModelId(sharedOptions.language, options.model),
          processors: options.processors,
          threads: options.threads,
          onProgress: (progress) => {
            if (options.onProgress) {
              options.onProgress(progress)
              return
            }
            options.logger?.info(
              `Transcribing ${audioFilepath} progress: ${Math.floor(progress * 100)}%`,
            )
          },
          ...whisperOptions,
        },
        ...sharedOptions,
      })
    }

    case "google-cloud": {
      if (!options.googleCloudApiKey) {
        throw new Error(
          "Failed to start transcription with engine google-cloud: missing API key",
        )
      }

      return recognize(audioFilepath, {
        engine: "google-cloud",
        options: {
          apiKey: options.googleCloudApiKey,
        },
        ...sharedOptions,
      })
    }

    case "microsoft-azure": {
      if (!options.azureServiceRegion) {
        throw new Error(
          "Failed to start transcription with engine microsoft-azure: missing service region",
        )
      }
      if (!options.azureSubscriptionKey) {
        throw new Error(
          "Failed to start transcription with engine microsoft-azure: missing subscription key",
        )
      }

      return recognize(audioFilepath, {
        engine: "microsoft-azure",
        options: {
          serviceRegion: options.azureServiceRegion,
          subscriptionKey: options.azureSubscriptionKey,
        },
        ...sharedOptions,
      })
    }

    case "amazon-transcribe": {
      if (!options.amazonTranscribeRegion) {
        throw new Error(
          "Failed to start transcription with engine amazon-transcribe: missing region",
        )
      }
      if (!options.amazonTranscribeAccessKeyId) {
        throw new Error(
          "Failed to start transcription with engine amazon-transcribe: missing access key id",
        )
      }
      if (!options.amazonTranscribeSecretAccessKey) {
        throw new Error(
          "Failed to start transcription with engine amazon-transcribe: missing access secret access key",
        )
      }
      if (!options.amazonTranscribeBucketName) {
        throw new Error(
          "Failed to start transcription with engine amazon-transcribe: missing bucket name",
        )
      }

      return recognize(audioFilepath, {
        engine: "amazon-transcribe",
        options: {
          region: options.amazonTranscribeRegion,
          accessKeyId: options.amazonTranscribeAccessKeyId,
          secretAccessKey: options.amazonTranscribeSecretAccessKey,
          bucketName: options.amazonTranscribeBucketName,
        },
        ...sharedOptions,
      })
    }

    case "openai-cloud": {
      return recognize(audioFilepath, {
        engine: "openai-cloud",
        options: {
          ...(options.openAiApiKey && { apiKey: options.openAiApiKey }),
          ...(options.openAiOrganization && {
            organization: options.openAiOrganization,
          }),
          ...(options.openAiBaseUrl && { baseURL: options.openAiBaseUrl }),
          model: options.openAiModelName ?? "whisper-1",
        },
        ...sharedOptions,
      })
    }

    case "whisper-server": {
      if (!options.whisperServerUrl) {
        throw new Error(
          "Failed to start transcription with engine whisper-server: missing server url",
        )
      }

      return recognize(audioFilepath, {
        engine: "whisper-server",
        options: {
          baseURL: options.whisperServerUrl,
          ...(options.whisperServerApiKey && {
            apiKey: options.whisperServerApiKey,
          }),
        },
        ...sharedOptions,
      })
    }

    case "deepgram": {
      if (!options.deepgramApiKey) {
        throw new Error(
          "Failed to start transcription with engine deepgram: missing api key",
        )
      }

      return recognize(audioFilepath, {
        engine: "deepgram",
        options: {
          apiKey: options.deepgramApiKey,
          // nova-3 is just as cheap as nova-2 and has better performance
          model: options.deepgramModel ?? "nova-3",
          punctuate: true,
        },
        ...sharedOptions,
      })
    }

    default: {
      throw new Error(
        `Unknown transcription engine: ${options.engine as string}`,
      )
    }
  }
}

function getWhisperCppModelId(
  language: string,
  modelType: WhisperModel | "large",
): WhisperCppOptions["model"] {
  if (modelType === "large") return "large-v3-turbo"
  if (language !== "en" || modelType.startsWith("large")) return modelType
  if (modelType.includes(".en")) return modelType
  const quant = modelType.indexOf("-q")
  if (quant === -1) return `${modelType}.en` as WhisperCppOptions["model"]
  return `${modelType.slice(0, quant)}.en${modelType.slice(quant)}` as WhisperCppOptions["model"]
}

function getCpuOverrideVariant(
  override: WhisperCpuOverride,
): BuildVariant | undefined {
  if (!override) return undefined

  const platform = os.platform()
  const arch = os.arch()

  if (platform === "linux" && arch === "x64") {
    const variant = (
      override === "blas" ? "linux-x64-blas" : "linux-x64-cpu"
    ) as BuildVariant
    return applyLegacyCpuFallback(variant)
  }
  if (platform === "linux" && arch === "arm64") {
    return "linux-arm64-cpu"
  }
  if (platform === "darwin" && arch === "arm64") {
    return "darwin-arm64-cpu"
  }
  if (platform === "darwin" && arch === "x64") {
    return "darwin-x64-cpu"
  }
  if (platform === "win32") {
    return "windows-x64-cpu"
  }

  return undefined
}
