import { type ReadStream, createReadStream } from "node:fs"
import { readFile } from "node:fs/promises"
import { Readable } from "node:stream"

import {
  type AudioFormat,
  type AudioFormatInfo,
  formatFromExtension,
} from "./AudioFormat.ts"

export type RawAudioInput = Readable | ReadStream | string

export interface AudioSourceFromFile {
  type: "file"
  path: string
  format: AudioFormat
}

export interface AudioSourceFromStream {
  type: "stream"
  stream: Readable | ReadStream
  format: AudioFormat
}

export interface AudioSourceFromBuffer {
  type: "buffer"
  buffer: Buffer
  format: AudioFormat
}

export type AudioSource =
  | AudioSourceFromFile
  | AudioSourceFromStream
  | AudioSourceFromBuffer

export function audioSourceFromFile(
  path: string,
  format?: AudioFormat,
): AudioSourceFromFile {
  const resolvedFormat = format ?? formatFromExtension(path)
  if (!resolvedFormat) {
    // throw new Error(
    //   `Cannot determine audio format for file: ${path}. Please specify the format explicitly.`,
    // )
    return { type: "file", path, format: "unknown" }
  }
  return { type: "file", path, format: resolvedFormat }
}

export function audioSourceFromStream(
  stream: Readable | ReadStream,
  format: AudioFormat,
): AudioSourceFromStream {
  return { type: "stream", stream, format }
}

export function audioSourceFromBuffer(
  buffer: Buffer,
  format: AudioFormat,
): AudioSourceFromBuffer {
  return { type: "buffer", buffer, format }
}

export function normalizeToAudioSource(
  input: RawAudioInput,
  format?: AudioFormat,
): AudioSource {
  if (typeof input === "string") {
    return audioSourceFromFile(input, format)
  }
  if (!format) {
    throw new Error(
      "When providing a stream, you must specify the audio format",
    )
  }
  return audioSourceFromStream(input, format)
}

export function isAudioSource(input: unknown): input is AudioSource {
  if (typeof input !== "object" || input === null) return false
  const obj = input as Record<string, unknown>
  if (typeof obj["type"] !== "string") return false
  if (!["file", "stream", "buffer"].includes(obj["type"])) return false
  if (typeof obj["format"] !== "string") return false
  return true
}

export function toReadStream(source: AudioSource): Readable | ReadStream {
  switch (source.type) {
    case "file":
      return createReadStream(source.path)
    case "stream":
      return source.stream
    case "buffer": {
      return Readable.from(source.buffer)
    }
  }
}

export async function toBuffer(source: AudioSource): Promise<Buffer> {
  switch (source.type) {
    case "file":
      return readFile(source.path)
    case "buffer":
      return source.buffer
    case "stream":
      return collectStreamToBuffer(source.stream)
  }
}

export function toFilePath(source: AudioSource): string | null {
  if (source.type === "file") return source.path
  return null
}

export function getFormat(source: AudioSource): AudioFormat {
  return source.format
}

export function getFormatInfo(source: AudioSource): AudioFormatInfo {
  return { format: source.format }
}

async function collectStreamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks)
}
