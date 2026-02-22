import type { ReadStream } from "node:fs"
import type { Readable } from "node:stream"

import {
  type AudioFormat,
  type AudioSource,
  isAudioSource,
  normalizeToAudioSource,
  serviceCapabilities,
} from "../audio/index.ts"
import { type ConversionMode, getConversionMode } from "../config.ts"
import type { OpenAICloudSTTOptions } from "../recognition/OpenAICloudSTT.ts"
import type {
  Language,
  WhisperCppOptions,
} from "../recognition/WhisperCppSTT.ts"
import type { WhisperServerOptions } from "../recognition/WhisperServerSTT.ts"
import { getShortLanguageCode } from "../utilities/Locale.ts"
import { extendDeep } from "../utilities/ObjectUtilities.ts"
import {
  type Timeline,
  addWordTextOffsetsToTimelineInPlace,
  buildTranscriptFromTimeline,
} from "../utilities/Timeline.ts"
import { type TimingSummary, createTiming } from "../utilities/Timing.ts"

export type AudioInput = Readable | ReadStream | string | AudioSource

export type Audio = AudioInput

export async function recognize(
  input: AudioInput,
  options: RecognitionOptions,
): Promise<RecognitionResult> {
  const opts = extendDeep(
    defaultRecognitionOptions,
    options,
  ) as RecognitionOptions

  const timing = createTiming()

  timing.setMetadata("engine", opts.engine)
  timing.setMetadata(
    "conversionMode",
    opts.conversionMode ?? getConversionMode(),
  )

  if (!opts.language) {
    throw new Error("Language must be specified")
  }

  const languageCode = opts.language
  const shortLanguageCode = getShortLanguageCode(languageCode)

  timing.setMetadata("language", languageCode)

  const source = resolveAudioSource(input, opts)
  timing.setMetadata("inputFormat", source.format)

  let transcript: string = ""
  let timeline: Timeline | undefined

  switch (opts.engine) {
    case "whisper.cpp": {
      const WhisperCppSTT = await import("../recognition/WhisperCppSTT.ts")

      timing.setMetadata("model", opts.options.model)
      timing.setMetadata("processors", opts.options.processors ?? 1)
      timing.setMetadata("threads", opts.options.threads ?? 4)

      const result = await WhisperCppSTT.recognize(
        source,
        timing,
        {
          ...opts.options,
          language: shortLanguageCode as Language,
        },
        opts.signal,
      )

      timeline = result.timeline
      transcript = buildTranscriptFromTimeline(timeline)
      break
    }

    case "openai-cloud": {
      const OpenAICloudSTT = await import("../recognition/OpenAICloudSTT.ts")

      timing.setMetadata("model", opts.options.model ?? "whisper-1")

      const result = await OpenAICloudSTT.recognize(
        source,
        shortLanguageCode,
        timing,
        opts.options,
      )

      timeline = result.timeline
      transcript = timeline
        ? buildTranscriptFromTimeline(timeline)
        : result.transcript
      break
    }

    case "whisper-server": {
      const WhisperServerSTT = await import(
        "../recognition/WhisperServerSTT.ts"
      )

      const result = await WhisperServerSTT.recognize(
        source,
        shortLanguageCode,
        timing,
        { ...opts.options },
      )

      timeline = result.timeline
      transcript = timeline
        ? buildTranscriptFromTimeline(timeline)
        : result.transcript
      break
    }

    case "google-cloud": {
      const GoogleCloudSTT = await import("../recognition/GoogleCloudSTT.ts")

      if (!opts.options.apiKey) {
        throw new Error("Google Cloud API key is required")
      }

      const result = await GoogleCloudSTT.recognize(
        source,
        shortLanguageCode,
        timing,
        opts.options,
      )

      transcript = result.transcript
      timeline = result.timeline
      break
    }

    case "microsoft-azure": {
      const AzureCognitiveServicesSTT = await import(
        "../recognition/AzureCognitiveServicesSTT.ts"
      )

      if (!opts.options.subscriptionKey) {
        throw new Error("Azure subscription key is required")
      }

      if (!opts.options.serviceRegion) {
        throw new Error("Azure service region is required")
      }

      const result = await AzureCognitiveServicesSTT.recognize(
        source,
        shortLanguageCode,
        timing,
        {
          subscriptionKey: opts.options.subscriptionKey,
          serviceRegion: opts.options.serviceRegion,
          inputFormat: opts.inputFormat,
        },
      )

      transcript = result.transcript
      timeline = result.timeline
      break
    }

    case "amazon-transcribe": {
      const AmazonTranscribeSTT = await import(
        "../recognition/AmazonTranscribeSTT.ts"
      )

      const result = await AmazonTranscribeSTT.recognize(
        source,
        languageCode,
        timing,
        {
          region: opts.options.region,
          accessKeyId: opts.options.accessKeyId,
          secretAccessKey: opts.options.secretAccessKey,
          bucketName: opts.options.bucketName,
          inputFormat: opts.inputFormat,
        },
      )

      transcript = result.transcript
      timeline = result.timeline
      break
    }

    case "deepgram": {
      const DeepgramSTT = await import("../recognition/DeepgramSTT.ts")

      if (!opts.options.apiKey) {
        throw new Error("Deepgram API key is required")
      }

      timing.setMetadata("model", opts.options.model)

      const result = await DeepgramSTT.recognize(
        source,
        shortLanguageCode,
        timing,
        {
          apiKey: opts.options.apiKey,
          model: opts.options.model,
          punctuate: opts.options.punctuate,
          inputFormat: opts.inputFormat,
          conversionMode: opts.conversionMode,
        },
        opts.signal,
      )
      timeline = result.timeline
      transcript = buildTranscriptFromTimeline(timeline)
      break
    }

    default: {
      const _engine: never = opts
      throw new Error(
        `Unknown engine: ${(_engine as { engine: string }).engine}`,
      )
    }
  }

  if (!timeline) {
    throw new Error(`No timeline returned from engine ${opts.engine}`)
  }

  // build transcript from timeline words to ensure exact offset matching.
  // this prevents issues when the API's transcript formatting doesn't exactly
  // match the word-level timeline (different punctuation, whitespace, etc.)
  addWordTextOffsetsToTimelineInPlace(timeline, transcript)

  return {
    transcript,
    timeline,
    language: languageCode,
    timing: timing.summary(),
  }
}

function resolveAudioSource(
  input: AudioInput,
  opts: RecognitionOptions,
): AudioSource {
  if (isAudioSource(input)) {
    return input
  }
  return normalizeToAudioSource(input, opts.inputFormat)
}

export interface RecognitionResult {
  transcript: string
  timeline: Timeline
  language: string
  timing: TimingSummary
}

export type RecognitionEngine =
  | "whisper.cpp"
  | "whisper-server"
  | "google-cloud"
  | "microsoft-azure"
  | "amazon-transcribe"
  | "openai-cloud"
  | "deepgram"

interface BaseRecognitionOptions {
  language: string
  signal?: AbortSignal | null | undefined
  inputFormat?: AudioFormat
  conversionMode?: ConversionMode | undefined
}

export type RecognitionOptions =
  | (BaseRecognitionOptions & {
      engine: "whisper.cpp"
      options: WhisperCppOptions
    })
  | (BaseRecognitionOptions & {
      engine: "whisper-server"
      options: WhisperServerOptions
    })
  | (BaseRecognitionOptions & {
      engine: "openai-cloud"
      options: OpenAICloudSTTOptions
    })
  | (BaseRecognitionOptions & {
      engine: "google-cloud"
      options: {
        apiKey: string
        alternativeLanguageCodes?: string[]
        profanityFilter?: boolean
        autoPunctuation?: boolean
        useEnhancedModel?: boolean
      }
    })
  | (BaseRecognitionOptions & {
      engine: "microsoft-azure"
      options: {
        subscriptionKey: string
        serviceRegion: string
      }
    })
  | (BaseRecognitionOptions & {
      engine: "amazon-transcribe"
      options: {
        region: string
        accessKeyId: string
        secretAccessKey: string
        bucketName: string
      }
    })
  | (BaseRecognitionOptions & {
      engine: "deepgram"
      options: {
        apiKey: string
        model: string
        punctuate: boolean
      }
    })

const defaultRecognitionOptions: Partial<RecognitionOptions> = {
  engine: "whisper.cpp",
  options: {
    model: "tiny.en",
  },
}

export const recognitionEngines: {
  id: RecognitionEngine
  name: string
  description: string
  type: "local" | "cloud" | "server"
  acceptsFormats: AudioFormat[]
  preferredFormat: AudioFormat
}[] = [
  {
    id: "whisper.cpp",
    name: "OpenAI Whisper (C++ port)",
    description: "Local whisper.cpp binary. Accepts wav, flac, ogg, mp3.",
    type: "local",
    acceptsFormats: serviceCapabilities["whisper.cpp"].acceptsFormats,
    preferredFormat: serviceCapabilities["whisper.cpp"].preferredFormat,
  },
  {
    id: "whisper-server",
    name: "Whisper Server",
    description: "whisper.cpp server API. Prefers wav format.",
    type: "server",
    acceptsFormats: serviceCapabilities["whisper-server"].acceptsFormats,
    preferredFormat: serviceCapabilities["whisper-server"].preferredFormat,
  },
  {
    id: "openai-cloud",
    name: "OpenAI Cloud",
    description: "OpenAI cloud API. Accepts wav, flac, mp3, m4a, ogg, webm.",
    type: "cloud",
    acceptsFormats: serviceCapabilities["openai-cloud"].acceptsFormats,
    preferredFormat: serviceCapabilities["openai-cloud"].preferredFormat,
  },
  {
    id: "google-cloud",
    name: "Google Cloud",
    description: "Google Cloud Speech-to-Text. Prefers flac format.",
    type: "cloud",
    acceptsFormats: serviceCapabilities["google-cloud"].acceptsFormats,
    preferredFormat: serviceCapabilities["google-cloud"].preferredFormat,
  },
  {
    id: "microsoft-azure",
    name: "Azure Cognitive Services",
    description: "Microsoft Azure Speech-to-Text. Requires wav format.",
    type: "cloud",
    acceptsFormats: serviceCapabilities["microsoft-azure"].acceptsFormats,
    preferredFormat: serviceCapabilities["microsoft-azure"].preferredFormat,
  },
  {
    id: "amazon-transcribe",
    name: "Amazon Transcribe",
    description: "Amazon Transcribe streaming. Accepts flac, opus, ogg.",
    type: "cloud",
    acceptsFormats: serviceCapabilities["amazon-transcribe"].acceptsFormats,
    preferredFormat: serviceCapabilities["amazon-transcribe"].preferredFormat,
  },
  {
    id: "deepgram",
    name: "Deepgram",
    description: "Deepgram API. Accepts most common formats.",
    type: "cloud",
    acceptsFormats: serviceCapabilities["deepgram"].acceptsFormats,
    preferredFormat: serviceCapabilities["deepgram"].preferredFormat,
  },
]
