import { openAsBlob } from "node:fs"
import { basename } from "node:path"

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
import { createTimeoutAgent } from "../fetch.ts"
import type { Timeline } from "../utilities/Timeline.ts"
import type { Timing } from "../utilities/Timing.ts"
import {
  type RawWhisperSegment,
  type WhisperServerSegment,
  calculateEffectiveProcessors,
  calculateWhisperSplits,
  countProcessorBoundaries,
  extractCorrectedTimeline,
  parseWhisperServerOutput,
} from "../utilities/WhisperTimeline.ts"

export type InputPreference = "file"
export const inputPreference: InputPreference = "file"

type WhisperServerRunConfig = {
  threads: number
  processors: number
  model: string
  maxThreads: number
  maxProcessors: number
  audioDuration: number
}

export interface WhisperServerOptions {
  baseURL?: string
  inferencePath?: string
  temperature?: number
  apiKey?: string
  inputFormat?: AudioFormat
  /**
   * timeout in milliseconds waiting for a response from the whisper server
   */
  timeout?: number
}

const defaultOptions: Required<
  Omit<WhisperServerOptions, "apiKey" | "inputFormat" | "timing">
> = {
  baseURL: "http://localhost:8080",
  inferencePath: "/audio/transcriptions",
  temperature: 0,
  timeout: 30 * 60 * 1000, // 30 minutes
}

export interface RecognitionResult {
  transcript: string
  timeline?: Timeline
}

export async function recognize(
  input: RawAudioInput | AudioSource,
  languageCode: string,
  timing: Timing,
  options?: WhisperServerOptions,
): Promise<RecognitionResult> {
  const opts = { ...defaultOptions, ...options }

  const source = isAudioSource(input)
    ? input
    : normalizeToAudioSource(input, opts.inputFormat)

  const conversionNeeded = source.format !== "wav"
  timing.setMetadata("conversionRequired", conversionNeeded)
  timing.setMetadata("targetFormat", "wav")

  const doPrepare = () =>
    prepareWavForService(source, { sampleRate: 16000, channels: 1 })

  const prepared = await timing.timeAsync("conversion", doPrepare)

  try {
    const filePath = toFilePath(prepared.source)
    if (!filePath) {
      throw new Error(
        "Whisper server requires a file path. The audio could not be prepared as a file.",
      )
    }

    const filename = basename(filePath)
    const blob = await openAsBlob(filePath)

    const form = new FormData()
    form.append("file", blob, filename)
    form.append("temperature", String(opts.temperature))
    form.append("response_format", "verbose_json")

    if (languageCode) {
      form.append("language", languageCode)
    }

    const baseUrl = opts.baseURL.replace(/\/+$/g, "")
    const url = `${baseUrl}${opts.inferencePath}`
    const headers: Record<string, string> = {}
    if (opts.apiKey) {
      headers["Authorization"] = `Bearer ${opts.apiKey}`
    }

    // check for config
    const configResponse = await fetch(`${baseUrl}/config`, {
      headers,
      dispatcher: createTimeoutAgent(opts.timeout),
    } as RequestInit)
    let whisperConfig: WhisperServerRunConfig | null = null
    if (configResponse.ok) {
      try {
        const [config, audioLength] = await Promise.all([
          configResponse.json(),
          getAudioDuration(filePath),
        ])

        whisperConfig = {
          ...(config as WhisperServerRunConfig),
          audioDuration: audioLength,
        }

        // if we get a config, we are using ghost-story server, so we have control over the number of processors used
        // check if we need to lower number of proessors
        const effectiveProcessors = calculateEffectiveProcessors(
          audioLength,
          whisperConfig.maxProcessors,
        )
        if (effectiveProcessors !== whisperConfig.processors) {
          const configForm = new FormData()
          configForm.append("processors", String(effectiveProcessors))
          configForm.append("threads", String(whisperConfig.threads))

          await fetch(`${baseUrl}/config`, {
            method: "POST",
            headers,
            body: configForm,
          } as RequestInit)

          whisperConfig.processors = effectiveProcessors
        }
      } catch (e) {
        console.warn(
          `Failed to get config from Whisper server, continuing with default config. If you aren't using ghost-story server, this is expected`,
          e,
        )
        // ignore
      }
    }

    const response = await timing.timeAsync("upload", async () =>
      fetch(url, {
        method: "POST",
        body: form,
        headers,
        dispatcher: createTimeoutAgent(opts.timeout),
        // this is necessary because  `tsc` from `/web` will cry and shit its pants
      } as RequestInit),
    )

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Whisper server error: ${response.status} ${text}`)
    }

    const data = (await response.json()) as WhisperServerResponse

    const { timeline, transcript } = await extractTimelineAndTranscript(
      data,
      filePath,
      whisperConfig,
    )
    if (!timeline) {
      throw new Error(
        `Failed to extract timeline from Whisper server response. This was the transcript: '${transcript}'`,
      )
    }

    return { transcript, timeline }
  } finally {
    await prepared.cleanup()
  }
}

interface ExtractedResult {
  timeline: Timeline | undefined
  transcript: string
}

async function extractTimelineAndTranscript(
  response: WhisperServerResponse,
  audioPath: string,
  whisperConfig?: WhisperServerRunConfig | null,
): Promise<ExtractedResult> {
  if (response.segments.length === 0) {
    return { timeline: [], transcript: response.text?.trim() ?? "" }
  }

  const hasNestedWords = (response.segments[0]?.words?.length ?? 0) > 0

  if (hasNestedWords) {
    const rawSegments = parseWhisperServerOutput(response.segments)
    // we either know where the splits are bc we are using an up to date ghost-story, or we need to try and detect them (which is pretyy jank)
    const splitBoundaries = whisperConfig?.audioDuration
      ? calculateWhisperSplits(
          whisperConfig.audioDuration,
          whisperConfig.processors,
        )
      : await detectSplitBoundaries(rawSegments, audioPath)

    const timeline = extractCorrectedTimeline(rawSegments, { splitBoundaries })

    // build transcript from timeline words to ensure exact match
    // the server's text field has arbitrary newlines that don't match the words
    // which will cause {@link addWordTextOffsetsToTimelineInPlace} to fail
    const transcript = timeline.map((entry) => entry.text).join(" ")

    return { timeline, transcript }
  }

  const timeline = response.segments.map((seg) => ({
    type: "segment" as const,
    text: seg.text.trim(),
    startTime: seg.start,
    endTime: seg.end,
  })) as Timeline

  return { timeline, transcript: response.text?.trim() ?? "" }
}

/**
 * detect, when running whisper server, the number of processors used to transcribe the audio.
 * works prety well for longer files, unreliable for short ones
 */
async function detectSplitBoundaries(
  rawSegments: RawWhisperSegment[],
  audioPath: string,
): Promise<number[] | undefined> {
  const boundaryCount = countProcessorBoundaries(rawSegments)
  if (boundaryCount === 0) return undefined

  try {
    const audioDuration = await getAudioDuration(audioPath)
    // number of processors = boundary count + 1
    return calculateWhisperSplits(audioDuration, boundaryCount + 1)
  } catch {
    // if we can't get duration, proceed without split boundaries
    return undefined
  }
}

interface WhisperServerResponse {
  text?: string
  segments: WhisperServerSegment[]
}
