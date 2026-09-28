import { execFile } from "node:child_process"
import { readFile, rm } from "node:fs/promises"
import { promisify } from "node:util"

import { type Scratch } from "../utilities/Scratch.ts"

import { PCM_SAMPLE_RATE, type SourceInfo } from "./PlanBlocks.ts"

const execFileAsync = promisify(execFile)

const SEEKABLE_FORMATS = new Set([
  "mov,mp4,m4a,3gp,3g2,mj2",
  "wav",
  "flac",
  "mp3",
  "ogg",
])

export interface DecodeRequest {
  path: string
  decodeStart: number
  decodeEnd: number | null
  keepStart: number
  keepEnd: number | null
}

export interface DecodeOptions {
  scratch: Scratch
  signal: AbortSignal | null
  ffmpegPath?: string | undefined
}

export async function probeSource(
  path: string,
  ffprobePath = "ffprobe",
): Promise<SourceInfo> {
  const { stdout } = await execFileAsync(ffprobePath, [
    "-v",
    "error",
    "-show_entries",
    "format=duration,format_name",
    "-of",
    "json",
    path,
  ])
  const { format } = JSON.parse(stdout) as {
    format?: { duration?: string; format_name?: string }
  }
  const durationSeconds = Number.parseFloat(format?.duration ?? "")
  if (!Number.isFinite(durationSeconds)) {
    throw new Error(`Failed to read the duration of ${path}`)
  }
  return {
    path,
    durationSeconds,
    seekable: SEEKABLE_FORMATS.has(format?.format_name ?? ""),
  }
}

export async function decodePcm(
  request: DecodeRequest,
  options: DecodeOptions,
): Promise<Float32Array> {
  options.signal?.throwIfAborted()

  const output = options.scratch.unique(".pcm")
  const seconds = (samples: number) => (samples / PCM_SAMPLE_RATE).toFixed(6)

  const range: string[] = []
  if (request.decodeStart > 0) {
    range.push("-ss", seconds(request.decodeStart))
  }
  if (request.decodeEnd !== null) {
    range.push("-t", seconds(request.decodeEnd - request.decodeStart))
  }

  try {
    try {
      await execFileAsync(
        options.ffmpegPath ?? "ffmpeg",
        [
          "-hide_banner",
          "-nostdin",
          "-loglevel",
          "error",
          ...range,
          "-i",
          request.path,
          "-map",
          "0:a:0",
          "-vn",
          "-sn",
          "-dn",
          "-f",
          "f32le",
          "-ac",
          "1",
          "-ar",
          String(PCM_SAMPLE_RATE),
          "-y",
          output,
        ],
        { ...(options.signal ? { signal: options.signal } : {}) },
      )
    } catch (error) {
      options.signal?.throwIfAborted()
      throw new Error(
        `Failed to decode ${request.path} from sample ${request.decodeStart}`,
        { cause: error },
      )
    }

    const decoded = toFloat32(await readFile(output))
    const from = request.keepStart - request.decodeStart
    const to =
      request.keepEnd === null
        ? decoded.length
        : Math.min(decoded.length, request.keepEnd - request.decodeStart)
    return decoded.subarray(from, Math.max(from, to))
  } finally {
    await rm(output, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 50,
    }).catch(() => {})
  }
}

function toFloat32(bytes: Uint8Array): Float32Array {
  const count = bytes.byteLength >> 2
  const aligned =
    bytes.byteOffset % 4 === 0 ? bytes : new Uint8Array(bytes.subarray(0))
  return new Float32Array(aligned.buffer, aligned.byteOffset, count)
}
