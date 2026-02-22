import {
  type AudioFormat,
  type AudioSource,
  type RawAudioInput,
  convertToBuffer,
  isAudioSource,
  needsConversion,
  normalizeToAudioSource,
  toBuffer,
} from "../audio/index.ts"
import { encodeBase64 } from "../encodings/Base64.ts"
import type { Timeline } from "../utilities/Timeline.ts"
import type { Timing } from "../utilities/Timing.ts"

const SERVICE_ID = "google-cloud"

export interface GoogleCloudSTTOptions {
  apiKey: string
  alternativeLanguageCodes?: string[] | undefined
  profanityFilter?: boolean | undefined
  autoPunctuation?: boolean | undefined
  useEnhancedModel?: boolean | undefined
  inputFormat?: AudioFormat | undefined
  timing?: Timing | undefined
}

export async function recognize(
  input: RawAudioInput | AudioSource,
  languageCode = "en-US",
  timing: Timing,
  options: GoogleCloudSTTOptions,
  signal?: AbortSignal | null,
) {
  const source = isAudioSource(input)
    ? input
    : normalizeToAudioSource(input, options.inputFormat)

  let encoding: GoogleEncoding = formatToGoogleEncoding(source.format)
  const conversionNeeded = needsConversion(source.format, SERVICE_ID)

  timing.setMetadata("conversionRequired", conversionNeeded)
  timing.setMetadata("targetFormat", conversionNeeded ? "flac" : source.format)

  const doConversion = async (): Promise<Buffer> => {
    if (conversionNeeded) {
      const converted = await convertToBuffer(source, {
        targetFormat: "flac",
        sampleRate: 16000,
        channels: 1,
      })
      encoding = "FLAC"
      return (converted.source as { buffer: Buffer }).buffer
    }
    return toBuffer(source)
  }

  const audioBuffer = await timing.timeAsync("conversion", doConversion)

  const requestBody = {
    config: {
      encoding,
      sampleRateHertz: 16000,
      audioChannelCount: 1,
      languageCode,
      alternativeLanguageCodes: options.alternativeLanguageCodes ?? [],
      maxAlternatives: 1,
      profanityFilter: options.profanityFilter ?? false,
      enableWordTimeOffsets: true,
      enableWordConfidence: true,
      enableAutomaticPunctuation: options.autoPunctuation ?? true,
      model: "latest_long",
      useEnhanced: options.useEnhancedModel ?? true,
    },
    audio: {
      content: encodeBase64(audioBuffer),
    },
  }

  const doUpload = () =>
    fetch(`https://speech.googleapis.com/v1p1beta1/speech:recognize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: signal ?? null,
    })

  const response = await timing.timeAsync("upload", doUpload)

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Google Cloud STT error: ${response.status} ${text}`)
  }

  const result = parseResponseBody(
    (await response.json()) as GoogleCloudSTTResponse,
  )

  return result
}

type GoogleEncoding =
  | "LINEAR16"
  | "FLAC"
  | "MULAW"
  | "AMR"
  | "AMR_WB"
  | "OGG_OPUS"
  | "SPEEX_WITH_HEADER_BYTE"
  | "MP3"
  | "WEBM_OPUS"

function formatToGoogleEncoding(format: AudioFormat): GoogleEncoding {
  switch (format) {
    case "wav":
      return "LINEAR16"
    case "flac":
      return "FLAC"
    case "mp3":
      return "MP3"
    case "opus":
    case "ogg":
      return "OGG_OPUS"
    case "webm":
      return "WEBM_OPUS"
    default:
      return "FLAC"
  }
}

export interface GoogleCloudSTTResponse {
  results: {
    alternatives?: {
      transcript: string
      words: {
        word: string
        startTime: string
        endTime: string
        confidence: number
      }[]
    }[]
  }[]
}

function parseResponseBody(responseBody: GoogleCloudSTTResponse) {
  const results = responseBody.results

  let transcript = ""
  const timeline: Timeline = []

  for (const result of results) {
    if (!result.alternatives?.[0]?.transcript) continue

    const firstAlternative = result.alternatives[0]
    transcript += firstAlternative.transcript

    for (const wordEvent of firstAlternative.words) {
      timeline.push({
        type: "word",
        text: wordEvent.word,
        startTime: parseFloat(wordEvent.startTime.replace("s", "")),
        endTime: parseFloat(wordEvent.endTime.replace("s", "")),
        confidence: wordEvent.confidence,
      })
    }
  }

  return { transcript, timeline }
}
