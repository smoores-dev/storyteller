import { openAsBlob } from "node:fs"
import { basename } from "node:path"

import {
  type AudioFormat,
  type AudioSource,
  type RawAudioInput,
  isAudioSource,
  normalizeToAudioSource,
  prepareWavForService,
  toFilePath,
} from "../audio/index.ts"
import { createTimeoutAgent } from "../fetch.ts"
import { type Timing } from "../utilities/Timing.ts"

import { type EmissionWireResult, decodeEmissions } from "./EmissionWire.ts"
import { type Wav2Vec2Result } from "./Wav2Vec2Emission.ts"

export interface Wav2Vec2ServerOptions {
  baseURL: string
  apiKey?: string | null
  timeout?: number
  inputFormat?: AudioFormat
  onProgress?: (progress: number) => void
}

const defaultOptions = {
  baseURL: "http://localhost:8080",
  inferencePath: "/audio/emissions",
  timeout: 30 * 60 * 1000,
}

export async function emit(
  input: RawAudioInput | AudioSource,
  timing: Timing,
  options: Wav2Vec2ServerOptions,
  signal?: AbortSignal | null,
): Promise<Wav2Vec2Result> {
  const opts = { ...defaultOptions, ...options }

  if (!opts.baseURL) {
    throw new Error("Missing CTC server URL")
  }

  const source = isAudioSource(input)
    ? input
    : normalizeToAudioSource(input, opts.inputFormat)

  const conversionNeeded = source.format !== "wav"
  timing.setMetadata("conversionRequired", conversionNeeded)
  timing.setMetadata("targetFormat", "wav")

  const doPrepare = () =>
    prepareWavForService(source, { sampleRate: 16000, channels: 1 })

  await using prepared = await timing.timeAsync("conversion", doPrepare)

  const filePath = toFilePath(prepared.source)
  if (!filePath) {
    throw new Error(
      "The CTC server requires a file path. The audio could not be prepared as a file.",
    )
  }

  if (signal?.aborted) {
    throw signal.reason
  }

  const blob = await openAsBlob(filePath)
  const form = new FormData()
  form.append("file", blob, basename(filePath))

  const headers: Record<string, string> = {}
  if (opts.apiKey) {
    headers["Authorization"] = `Bearer ${opts.apiKey}`
  }

  const baseUrl = opts.baseURL.replace(/\/+$/g, "")

  opts.onProgress?.(0)

  const response = await timing.timeAsync("transcription", async () =>
    fetch(`${baseUrl}${opts.inferencePath}`, {
      method: "POST",
      body: form,
      headers,
      signal: signal ?? null,
      dispatcher: createTimeoutAgent(opts.timeout),
    } as RequestInit),
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`CTC server error: ${response.status} ${text}`)
  }

  const data = (await response.json()) as EmissionWireResult

  timing.setMetadata("serverWallClockMs", data.timing.wallClockMs)

  const result = {
    emissions: decodeEmissions(data.emissions, data.frames, data.dims),
    vocab: new Map(Object.entries(data.vocab)),
    blankIndex: data.blankIndex,
    secondsPerChunk: data.secondsPerChunk,
    framesPerChunk: data.framesPerChunk,
    secondsPerFrame: data.secondsPerFrame,
  }

  opts.onProgress?.(1)

  return result
}
