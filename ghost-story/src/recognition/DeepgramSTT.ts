import {
  type AudioFormat,
  type AudioSource,
  type RawAudioInput,
  createStreamForUpload,
  isAudioSource,
  needsConversion,
  normalizeToAudioSource,
  serviceCapabilities,
} from "../audio/index.ts"
import { type ConversionMode, getConversionMode } from "../config.ts"
import { extendDeep } from "../utilities/ObjectUtilities.ts"
import type { TimelineEntry } from "../utilities/Timeline.ts"
import type { Timing } from "../utilities/Timing.ts"

const SERVICE_ID = "deepgram"

// function formatToDeepgramEncoding(format: AudioFormat): string {
//   switch (format) {
//     case "wav":
//       return "wav"
//     case "flac":
//       return "flac"
//     case "opus":
//     case "ogg":
//       return "opus"
//     case "mp3":
//       return "mp3"
//     case "webm":
//       return "webm"
//     default:
//       return "wav"
//   }
// }

function formatToContentType(format: AudioFormat): string {
  switch (format) {
    case "wav":
      return "audio/wav"
    case "flac":
      return "audio/flac"
    case "opus":
    case "ogg":
      return "audio/ogg"
    case "mp3":
      return "audio/mpeg"
    case "webm":
      return "audio/webm"
    default:
      return "audio/wav"
  }
}

export async function recognize(
  input: RawAudioInput | AudioSource,
  languageCode: string | undefined,
  timing: Timing,
  options: DeepgramSTTOptions,
  signal?: AbortSignal | null,
) {
  const opts = extendDeep(defaultDeepgramSTTOptions, options)

  if (!opts.apiKey) {
    throw new Error("No Deepgram API key provided")
  }

  const source = isAudioSource(input)
    ? input
    : normalizeToAudioSource(input, opts.inputFormat)

  const caps = serviceCapabilities[SERVICE_ID]
  const requiresConversion = needsConversion(source.format, SERVICE_ID)
  const targetFormat = requiresConversion ? caps.preferredFormat : source.format
  const mode = opts.conversionMode ?? getConversionMode()

  timing.setMetadata("targetFormat", targetFormat)
  timing.setMetadata("conversionMode", mode)
  timing.setMetadata("conversionRequired", requiresConversion)

  const uploadResult = await timing.timeAsync("conversion", () =>
    createStreamForUpload({
      source,
      targetFormat,
      sampleRate: caps.preferredSampleRate,
      channels: caps.preferredChannels,
      mode,
    }),
  )
  const params: Record<string, string> = {
    model: opts.model,
    // not necessary
    // encoding: formatToDeepgramEncoding(uploadResult.format),
    punctuate: opts.punctuate ? "true" : "false",
  }

  if (languageCode) {
    params["language"] = languageCode
  } else {
    params["detect_language"] = "true"
  }

  const searchParams = new URLSearchParams(params)
  const url = `https://api.deepgram.com/v1/listen?${searchParams.toString()}`
  try {
    const doUpload = async () => {
      const fetchPromise = fetch(url, {
        method: "POST",
        duplex: "half",
        headers: {
          Authorization: `Token ${opts.apiKey}`,
          "Content-Type": formatToContentType(uploadResult.format),
        },
        // necessary because otherwise there's some excruciating type error when running `yarn check`
        // from the root
        body: uploadResult.stream as unknown,
        signal: signal ?? null,
      } as RequestInit)

      const conversionPromise = uploadResult.start?.()
      const resp = await fetchPromise
      await conversionPromise
      return resp
    }

    const response = await timing.timeAsync("upload", doUpload)

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Deepgram request failed: ${response.status} ${text}`)
    }

    const deepgramResponse = (await response.json()) as DeepgramResponse

    const firstAlternative =
      deepgramResponse.results?.channels[0]?.alternatives[0]

    const transcript = firstAlternative?.transcript || ""
    const words = firstAlternative?.words || []

    const timeline = words.map(
      (wordEntry: DeepgramWordEntry) =>
        ({
          type: "word",
          text: wordEntry.word,
          startTime: wordEntry.start,
          endTime: wordEntry.end,
          confidence: wordEntry.confidence,
        }) as TimelineEntry,
    )

    if (opts.punctuate) {
      applyPunctuationToTimeline(timeline, transcript)
    }

    return { transcript, timeline }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      `Error transcribing ${typeof input === "string" ? input : "stream"} with Deepgram. URL: ${url}`,
    )
    console.error(error)
    throw error
  } finally {
    await uploadResult.cleanup()
  }
}

function applyPunctuationToTimeline(
  timeline: TimelineEntry[],
  transcript: string,
): void {
  const lowerCaseTranscript = transcript.toLocaleLowerCase()
  let readOffset = 0

  let lastMatchPosition: number | null = null
  for (let i = 0; i < timeline.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const wordEntry = timeline[i]!
    const wordEntryTextLowercase = wordEntry.text.toLocaleLowerCase()
    const matchPosition = lowerCaseTranscript.indexOf(
      wordEntryTextLowercase,
      readOffset,
    )

    if (matchPosition === -1) {
      throw new Error(
        `Couldn't match the word '${wordEntry.text}' in the lowercase transcript`,
      )
    }

    wordEntry.text = transcript.substring(
      matchPosition,
      matchPosition + wordEntryTextLowercase.length,
    )
    readOffset = matchPosition + wordEntry.text.length

    if (lastMatchPosition !== null) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const lastWordEntry = timeline[i - 1]!
      const lastWord = lastWordEntry.text

      const gap = transcript.slice(
        lastMatchPosition + lastWord.length,
        matchPosition,
      )
      let suffix = ""
      let prefix = ""
      let foundWhitespace = false
      for (const char of gap) {
        if (foundWhitespace) {
          prefix += char
          continue
        }
        if (char.match(/\s/)) {
          foundWhitespace = true
          continue
        }
        suffix += char
      }

      if (suffix) {
        lastWordEntry.text += suffix
      }

      if (prefix) {
        wordEntry.text = prefix + wordEntry.text
      }
    }

    lastMatchPosition = matchPosition
  }
}

export interface DeepgramSTTOptions {
  apiKey: string
  model: string
  punctuate: boolean
  inputFormat?: AudioFormat | undefined
  conversionMode?: ConversionMode | undefined
}

export const defaultDeepgramSTTOptions: DeepgramSTTOptions = {
  apiKey: "",
  model: "nova-3",
  punctuate: true,
}

interface DeepgramWordEntry {
  word: string
  start: number
  end: number
  confidence: number
}

interface DeepgramAlternative {
  transcript: string
  confidence: number
  words: DeepgramWordEntry[]
}

interface DeepgramChannel {
  alternatives: DeepgramAlternative[]
}

interface DeepgramResponse {
  metadata?: {
    transaction_key: string
    request_id: string
    sha256: string
    created: string
    duration: number
    channels: number
    models: string[]
    model_info?: {
      name: string
      version: string
    }
  }
  results?: {
    channels: DeepgramChannel[]
    detected_language?: string
  }
}
