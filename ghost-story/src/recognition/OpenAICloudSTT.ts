import { createReadStream } from "node:fs"

import type { TranscriptionCreateParamsNonStreaming } from "openai/resources/audio/transcriptions.mjs"

import {
  type AudioFormat,
  type AudioSource,
  type RawAudioInput,
  isAudioSource,
  normalizeToAudioSource,
  prepareForService,
  toFilePath,
} from "../audio/index.ts"
import { extendDeep } from "../utilities/ObjectUtilities.ts"
import type { Timeline, TimelineEntry } from "../utilities/Timeline.ts"
import type { Timing } from "../utilities/Timing.ts"

const SERVICE_ID = "openai-cloud"

export type InputPreference = "stream"
export const inputPreference: InputPreference = "stream"

export interface OpenAICloudSTTOptions {
  model?: string | undefined
  apiKey?: string | undefined
  organization?: string | undefined
  baseURL?: string | undefined
  temperature?: number | undefined
  prompt?: string | undefined
  timeout?: number | undefined
  maxRetries?: number | undefined
  requestWordTimestamps?: boolean | undefined
  inputFormat?: AudioFormat
  timing?: Timing | undefined
}

const defaultOptions: OpenAICloudSTTOptions = {
  apiKey: undefined,
  organization: undefined,
  baseURL: undefined,
  model: undefined,
  temperature: 0,
  prompt: undefined,
  timeout: undefined,
  maxRetries: 10,
  requestWordTimestamps: true,
}

export interface RecognitionResult {
  transcript: string
  timeline?: Timeline
}

export async function recognize(
  input: RawAudioInput | AudioSource,
  languageCode: string,
  timing: Timing,
  options: OpenAICloudSTTOptions,
): Promise<RecognitionResult> {
  const opts = extendDeep(defaultOptions, options)

  if (opts.requestWordTimestamps === undefined) {
    opts.requestWordTimestamps = opts.baseURL === undefined
  }

  if (opts.model === undefined) {
    if (opts.baseURL === undefined) {
      opts.model = "whisper-1"
    } else {
      throw new Error(
        "A custom provider for the OpenAI Cloud API requires specifying a model name",
      )
    }
  }

  const source = isAudioSource(input)
    ? input
    : normalizeToAudioSource(input, opts.inputFormat)

  const prepared = await timing.timeAsync("conversion", () =>
    prepareForService(source, { service: SERVICE_ID, preferFile: true }),
  )

  const conversionOccurred = source.format !== prepared.source.format
  timing.setMetadata("conversionRequired", conversionOccurred)
  timing.setMetadata("targetFormat", prepared.source.format)

  try {
    const { default: OpenAI } = await import("openai")
    const openai = new OpenAI(opts)

    const filePath = toFilePath(prepared.source)
    if (!filePath) {
      throw new Error(
        "OpenAI Cloud STT requires a file path. The audio could not be prepared as a file.",
      )
    }

    const file = createReadStream(filePath)
    const timestamp_granularities: ("word" | "segment")[] | undefined =
      opts.requestWordTimestamps ? ["word", "segment"] : undefined

    const response = await timing.timeAsync("upload", () =>
      openai.audio.transcriptions.create({
        file,
        model: opts.model,
        language: languageCode,
        prompt: opts.prompt,
        response_format: "verbose_json",
        temperature: opts.temperature,
        timestamp_granularities,
      } as TranscriptionCreateParamsNonStreaming),
    )

    const verboseResponse = response as unknown as VerboseResponse

    const transcript = verboseResponse.text.trim()
    const timeline = extractTimeline(verboseResponse)

    if (!timeline) {
      throw new Error("Failed to extract timeline from OpenAI Cloud response")
    }

    return { transcript, timeline }
  } finally {
    await prepared.cleanup()
  }
}

function extractTimeline(response: VerboseResponse): Timeline | undefined {
  if (response.words) {
    return response.words.map<TimelineEntry>((entry) => ({
      type: "word",
      text: entry.word,
      startTime: entry.start,
      endTime: entry.end,
    }))
  }

  const hasNestedWords =
    response.segments.length > 0 &&
    response.segments[0]?.words &&
    response.segments[0].words.length > 0

  if (hasNestedWords) {
    return extractWordTimelineFromSegments(response.segments)
  }

  return response.segments.map<TimelineEntry>((entry) => ({
    type: "segment",
    text: entry.text,
    startTime: entry.start,
    endTime: entry.end,
  }))
}

function extractWordTimelineFromSegments(
  segments: VerboseResponse["segments"],
): Timeline {
  if (segments.length === 0) {
    return []
  }

  const splitOffsets = findSplitOffsets(segments)
  const wordTimeline: TimelineEntry[] = []
  let currentOffsetIndex = 0

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (!segment?.words || segment.words.length === 0 || !segment.words[0]) {
      continue
    }

    while (
      currentOffsetIndex < splitOffsets.length - 1 &&
      i >= (splitOffsets[currentOffsetIndex + 1]?.segmentIndex ?? -1)
    ) {
      currentOffsetIndex++
    }

    const timeOffset =
      currentOffsetIndex < splitOffsets.length
        ? splitOffsets[currentOffsetIndex]?.offset ?? 0
        : 0

    for (const word of segment.words) {
      const text = word.word.trim()
      if (text === "" || text.includes("BLANK_AUDIO")) {
        continue
      }

      wordTimeline.push({
        type: "word",
        text,
        startTime: word.start + timeOffset,
        endTime: word.end + timeOffset,
        confidence: word.probability ?? 0,
      })
    }
  }

  return wordTimeline
}

function findSplitOffsets(
  segments: VerboseResponse["segments"],
): { segmentIndex: number; offset: number }[] {
  const splitOffsets: { segmentIndex: number; offset: number }[] = []
  let lastWordEnd = -1

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (!segment?.words || segment.words.length === 0 || !segment.words[0]) {
      continue
    }

    const firstWordStart = segment.words[0].start
    if (firstWordStart < lastWordEnd - 0.5 || lastWordEnd === -1) {
      splitOffsets.push({ segmentIndex: i, offset: segment.start })
    }

    lastWordEnd = segment.words[segment.words.length - 1]?.end ?? -1
  }

  return splitOffsets
}

interface VerboseResponse {
  task: string
  language: string
  duration: number
  text: string
  segments: {
    text: string
    start: number
    end: number
    id: number
    no_speech_prob: number
    compression_ratio: number
    avg_logprob: number
    seek: number
    temperature: number
    tokens: number[]
    words?: {
      word: string
      start: number
      end: number
      probability?: number
      t_dtw?: number
    }[]
  }[]
  words?: {
    word: string
    start: number
    end: number
  }[]
}
