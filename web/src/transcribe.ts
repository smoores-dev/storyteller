import os from "node:os"
import { resolve } from "node:path"

import {
  type BuildVariant,
  type RecognitionResult,
  type WhisperCppOptions,
  applyLegacyCpuFallback,
  ensureWhisperInstalled,
  recognize,
} from "@storyteller-platform/ghost-story"

import type {
  Settings,
  WhisperCpuFallback,
  WhisperModel,
} from "./database/settingsTypes"
import { logger } from "./logging"

function getCpuFallbackVariant(
  fallback: WhisperCpuFallback,
): BuildVariant | undefined {
  if (!fallback) return undefined

  const platform = os.platform()
  const arch = os.arch()

  if (platform === "linux" && arch === "x64") {
    const variant = (
      fallback === "blas" ? "linux-x64-blas" : "linux-x64-cpu"
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

function getWhisperCppModelId(
  language: string,
  modelType: WhisperModel | "large",
): WhisperCppOptions["model"] {
  if (modelType === "large") return "large-v3-turbo"
  if (language !== "en" || modelType.startsWith("large"))
    return modelType as WhisperCppOptions["model"]
  if (modelType.includes(".en")) return modelType as WhisperCppOptions["model"]
  const quant = modelType.indexOf("-q")
  if (quant === -1) return `${modelType}.en` as WhisperCppOptions["model"]
  return `${modelType.slice(0, quant)}.en${modelType.slice(quant)}` as WhisperCppOptions["model"]
}

export async function transcribeTrack(
  path: string,
  locale: Intl.Locale,
  settings: Settings,
  signal: AbortSignal,
): Promise<Pick<RecognitionResult, "transcript" | "timeline" | "timing">> {
  const trackPath = resolve(process.cwd(), path)

  const sharedOptions = {
    signal,
    language: locale.language,
  }

  if (
    !settings.transcriptionEngine ||
    settings.transcriptionEngine === "whisper.cpp"
  ) {
    const fallbackVariant = getCpuFallbackVariant(settings.whisperCpuFallback)
    const whisperOptions = await ensureWhisperInstalled({
      model: settings.whisperModel ?? "tiny.en",
      variant: fallbackVariant,
      printOutput: true,
      signal,
    })

    logger.info(`Transcribing audio file ${trackPath}`)

    return recognize(trackPath, {
      engine: "whisper.cpp",
      options: {
        flashAttention: true,
        model: getWhisperCppModelId(
          locale.language,
          settings.whisperModel ?? "tiny",
        ),
        onProgress: (progress) => {
          logger.info(
            `Transcribing ${trackPath} progress: ${Math.floor(progress * 100)}%`,
          )
        },
        // todo: make this user configurable
        processors: settings.whisperThreads,
        threads: settings.whisperThreads * 4,
        ...whisperOptions,
      },
      ...sharedOptions,
    })
  }

  if (settings.transcriptionEngine === "google-cloud") {
    if (!settings.googleCloudApiKey) {
      throw new Error(
        "Failed to start transcription with engine google-cloud: missing API key",
      )
    }

    return recognize(trackPath, {
      engine: "google-cloud",
      options: {
        apiKey: settings.googleCloudApiKey,
      },
      ...sharedOptions,
    })
  }

  if (settings.transcriptionEngine === "microsoft-azure") {
    if (!settings.azureServiceRegion) {
      throw new Error(
        "Failed to start transcription with engine microsoft-azure: missing service region",
      )
    }
    if (!settings.azureSubscriptionKey) {
      throw new Error(
        "Failed to start transcription with engine microsoft-azure: missing subscription key",
      )
    }

    return recognize(trackPath, {
      engine: "microsoft-azure",
      options: {
        serviceRegion: settings.azureServiceRegion,
        subscriptionKey: settings.azureSubscriptionKey,
      },
      ...sharedOptions,
    })
  }

  if (settings.transcriptionEngine === "amazon-transcribe") {
    if (!settings.amazonTranscribeRegion) {
      throw new Error(
        "Failed to start transcription with engine amazon-transcribe: missing region",
      )
    }
    if (!settings.amazonTranscribeAccessKeyId) {
      throw new Error(
        "Failed to start transcription with engine amazon-transcribe: missing access key id",
      )
    }
    if (!settings.amazonTranscribeSecretAccessKey) {
      throw new Error(
        "Failed to start transcription with engine amazon-transcribe: missing access secret access key",
      )
    }
    if (!settings.amazonTranscribeBucketName) {
      throw new Error(
        "Failed to start transcription with engine amazon-transcribe: missing bucket name",
      )
    }

    return recognize(trackPath, {
      engine: "amazon-transcribe",
      options: {
        region: settings.amazonTranscribeRegion,
        accessKeyId: settings.amazonTranscribeAccessKeyId,
        secretAccessKey: settings.amazonTranscribeSecretAccessKey,
        bucketName: settings.amazonTranscribeBucketName,
      },
      ...sharedOptions,
    })
  }

  if (settings.transcriptionEngine === "openai-cloud") {
    if (!settings.openAiApiKey) {
      throw new Error(
        "Failed to start transcription with engine openai-cloud: missing api key",
      )
    }

    return recognize(trackPath, {
      engine: "openai-cloud",
      options: {
        apiKey: settings.openAiApiKey,
        ...(settings.openAiOrganization && {
          organization: settings.openAiOrganization,
        }),
        ...(settings.openAiBaseUrl && { baseURL: settings.openAiBaseUrl }),
        model: settings.openAiModelName ?? "whisper-1",
      },
      ...sharedOptions,
    })
  }

  if (settings.transcriptionEngine === "whisper-server") {
    if (!settings.whisperServerUrl) {
      throw new Error(
        "Failed to start transcription with engine whisper-server: missing server url",
      )
    }

    return recognize(trackPath, {
      engine: "whisper-server",
      options: {
        baseURL: settings.whisperServerUrl,
        ...(settings.whisperServerApiKey && {
          apiKey: settings.whisperServerApiKey,
        }),
      },
      ...sharedOptions,
    })
  }

  if ((settings.transcriptionEngine as string) === "deepgram") {
    if (!settings.deepgramApiKey) {
      throw new Error(
        "Failed to start transcription with engine deepgram: missing api key",
      )
    }
    return recognize(trackPath, {
      engine: "deepgram",
      options: {
        apiKey: settings.deepgramApiKey,
        // nova-3 is just as cheap as nova-2 and has better performance
        model: settings.deepgramModel ?? "nova-3",
        punctuate: true,
      },
      ...sharedOptions,
    })
  }

  throw new Error(
    `Unknown transcription engine: ${settings.transcriptionEngine as string}`,
  )
}
