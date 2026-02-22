import { extname } from "node:path"

import { type RecognitionEngine } from "../api/Recognition.ts"

export type AudioFormat =
  | "unknown"
  | "wav"
  | "flac"
  | "opus"
  | "ogg"
  | "mp3"
  | "webm"
  | "m4a"
  | "aac"
  | "pcm"
  | "mp4"

export type AudioEncoding = "pcm_s16le" | "flac" | "opus" | "mp3" | "aac"

export interface AudioFormatInfo {
  format: AudioFormat
  sampleRate?: number
  channels?: number
  bitDepth?: number
}

const extensionToFormat: Record<string, AudioFormat> = {
  ".wav": "wav",
  ".wave": "wav",
  ".flac": "flac",
  ".opus": "opus",
  ".ogg": "ogg",
  ".mp3": "mp3",
  ".webm": "webm",
  ".m4a": "m4a",
  ".aac": "aac",
  ".pcm": "pcm",
  ".mp4": "mp4",
}

export function formatFromExtension(filepath: string): AudioFormat | null {
  const ext = extname(filepath).toLowerCase()
  return extensionToFormat[ext] ?? null
}

export function formatToExtension(format: AudioFormat): string {
  switch (format) {
    case "wav":
      return ".wav"
    case "flac":
      return ".flac"
    case "opus":
      return ".opus"
    case "ogg":
      return ".ogg"
    case "mp3":
      return ".mp3"
    case "webm":
      return ".webm"
    case "m4a":
      return ".m4a"
    case "aac":
      return ".aac"
    case "pcm":
      return ".pcm"
    case "mp4":
      return ".mp4"
    default:
      return ".unknown"
  }
}

export interface ServiceCapabilities {
  acceptsFormats: AudioFormat[]
  preferredFormat: AudioFormat
  requiresFile: boolean
  supportsStreaming: boolean
  requiresBase64: boolean
  maxSampleRate?: number
  preferredSampleRate?: number
  preferredChannels?: number
}

export const serviceCapabilities = {
  "whisper.cpp": {
    acceptsFormats: ["wav", "flac", "ogg", "mp3"],
    preferredFormat: "wav",
    requiresFile: true,
    supportsStreaming: false,
    requiresBase64: false,
    preferredSampleRate: 16000,
    preferredChannels: 1,
  },
  "whisper-server": {
    acceptsFormats: ["wav"],
    preferredFormat: "wav",
    requiresFile: true,
    supportsStreaming: false,
    requiresBase64: false,
    preferredSampleRate: 16000,
    preferredChannels: 1,
  },
  "openai-cloud": {
    acceptsFormats: ["wav", "flac", "mp3", "m4a", "ogg", "webm", "mp4"],
    preferredFormat: "wav",
    requiresFile: false,
    preferredSampleRate: 16000,
    preferredChannels: 1,
    supportsStreaming: true,
    requiresBase64: false,
  },
  "google-cloud": {
    acceptsFormats: ["wav", "flac", "mp3", "ogg", "opus", "webm"],
    preferredFormat: "flac",
    requiresFile: false,
    supportsStreaming: false,
    requiresBase64: true,
    preferredSampleRate: 16000,
    preferredChannels: 1,
  },
  "microsoft-azure": {
    acceptsFormats: ["wav"],
    preferredFormat: "wav",
    requiresFile: false,
    supportsStreaming: true,
    requiresBase64: false,
    preferredSampleRate: 16000,
    preferredChannels: 1,
  },
  "amazon-transcribe": {
    acceptsFormats: ["flac", "opus", "ogg"],
    preferredFormat: "flac",
    requiresFile: false,
    supportsStreaming: true,
    requiresBase64: false,
    preferredSampleRate: 16000,
    preferredChannels: 1,
  },
  deepgram: {
    acceptsFormats: ["wav", "flac", "mp3", "opus", "ogg", "webm", "m4a"],
    preferredFormat: "wav",
    preferredSampleRate: 16000,
    preferredChannels: 1,
    requiresFile: false,
    supportsStreaming: true,
    requiresBase64: false,
  },
} as const satisfies Record<RecognitionEngine, ServiceCapabilities>

export function needsConversion(
  inputFormat: AudioFormat,
  service: RecognitionEngine,
): boolean {
  const caps = serviceCapabilities[service]
  return !caps.acceptsFormats.some((f) => f === inputFormat)
}

export function getTargetFormat(
  inputFormat: AudioFormat,
  service: RecognitionEngine,
): AudioFormat {
  const caps = serviceCapabilities[service]
  return caps.acceptsFormats.some((f) => f === inputFormat)
    ? inputFormat
    : caps.preferredFormat
}
