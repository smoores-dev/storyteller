import { execFile } from "node:child_process"
import { createReadStream, createWriteStream } from "node:fs"
import { rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { promisify } from "node:util"

import { Converter } from "ffmpeg-stream"

const execFilePromisified = promisify(execFile)

async function execFileAsync(
  cmd: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return execFilePromisified(cmd, args)
}

import { type RecognitionEngine } from "../api/Recognition.ts"
import { type ConversionMode, getConversionMode } from "../config.ts"

import {
  type AudioFormat,
  formatToExtension,
  getTargetFormat,
  needsConversion,
  serviceCapabilities,
} from "./AudioFormat.ts"
import {
  type AudioSource,
  audioSourceFromBuffer,
  audioSourceFromFile,
  toFilePath,
  toReadStream,
} from "./AudioSource.ts"

export interface ConversionOptions {
  targetFormat: AudioFormat
  sampleRate?: number | undefined
  channels?: number | undefined
}

export interface PreparedAudio {
  source: AudioSource
  cleanup: () => Promise<void>
}

function getFFmpegFormatOptions(
  format: AudioFormat,
  sampleRate?: number,
  channels?: number,
): Record<string, string> {
  const opts: Record<string, string> = {}

  switch (format) {
    case "wav":
      opts["f"] = "wav"
      opts["acodec"] = "pcm_s16le"
      break
    case "flac":
      opts["f"] = "flac"
      opts["acodec"] = "flac"
      break
    case "opus":
      opts["f"] = "ogg"
      opts["acodec"] = "libopus"
      break
    case "ogg":
      opts["f"] = "ogg"
      opts["acodec"] = "libvorbis"
      break
    case "mp3":
      opts["f"] = "mp3"
      opts["acodec"] = "libmp3lame"
      break
    default:
      opts["f"] = format
  }

  if (sampleRate) {
    opts["ar"] = String(sampleRate)
  }
  if (channels) {
    opts["ac"] = String(channels)
  }

  return opts
}

function getFFmpegInputFormat(format: AudioFormat): Record<string, string> {
  switch (format) {
    case "pcm":
      return { f: "s16le", ar: "16000", ac: "1" }
    default:
      return {}
  }
}

export async function convertToFile(
  source: AudioSource,
  options: ConversionOptions,
): Promise<PreparedAudio> {
  const tempPath = join(
    tmpdir(),
    `audio-convert-${Date.now()}${formatToExtension(options.targetFormat)}`,
  )

  const converter = new Converter()
  const inputPath = toFilePath(source)

  if (inputPath) {
    converter.createInputFromFile(inputPath)
  } else {
    const inputOpts = getFFmpegInputFormat(source.format)
    const inputStream = converter.createInputStream(inputOpts)
    const readable = toReadStream(source)
    readable.pipe(inputStream)
  }

  const outputOpts = getFFmpegFormatOptions(
    options.targetFormat,
    options.sampleRate,
    options.channels,
  )
  converter.createOutputToFile(tempPath, outputOpts)

  await converter.run()

  return {
    source: audioSourceFromFile(tempPath, options.targetFormat),
    cleanup: async () => {
      await rm(tempPath, { force: true }).catch(() => {})
    },
  }
}

export async function convertToBuffer(
  source: AudioSource,
  options: ConversionOptions,
): Promise<PreparedAudio> {
  const converter = new Converter()
  const inputPath = toFilePath(source)

  if (inputPath) {
    converter.createInputFromFile(inputPath)
  } else {
    const inputOpts = getFFmpegInputFormat(source.format)
    const inputStream = converter.createInputStream(inputOpts)
    const readable = toReadStream(source)
    readable.pipe(inputStream)
  }

  const outputOpts = getFFmpegFormatOptions(
    options.targetFormat,
    options.sampleRate,
    options.channels,
  )
  const outputStream = converter.createOutputStream(outputOpts)

  const chunks: Buffer[] = []
  outputStream.on("data", (chunk: Buffer) => chunks.push(chunk))

  const bufferPromise = new Promise<Buffer>((resolve, reject) => {
    outputStream.on("end", () => {
      resolve(Buffer.concat(chunks))
    })
    outputStream.on("error", reject)
  })

  await converter.run()
  const buffer = await bufferPromise

  return {
    source: audioSourceFromBuffer(buffer, options.targetFormat),
    cleanup: async () => {},
  }
}

export function convertToStream(
  source: AudioSource,
  options: ConversionOptions,
): { stream: Readable; runConversion: () => Promise<void> } {
  const converter = new Converter()
  const inputPath = toFilePath(source)

  if (inputPath) {
    converter.createInputFromFile(inputPath)
  } else {
    const inputOpts = getFFmpegInputFormat(source.format)
    const inputStream = converter.createInputStream(inputOpts)
    const readable = toReadStream(source)
    readable.pipe(inputStream)
  }

  const outputOpts = getFFmpegFormatOptions(
    options.targetFormat,
    options.sampleRate,
    options.channels,
  )
  const outputStream = converter.createOutputStream(outputOpts)

  return {
    stream: outputStream,
    runConversion: () => converter.run(),
  }
}

export interface PrepareForServiceOptions {
  service: RecognitionEngine
  preferFile?: boolean
  preferStream?: boolean
}

export async function prepareForService(
  source: AudioSource,
  options: PrepareForServiceOptions,
): Promise<PreparedAudio> {
  const caps = serviceCapabilities[options.service]
  if (!(caps as unknown)) {
    throw new Error(`Unknown service: ${options.service}`)
  }

  const inputFormat = source.format
  const requiresConversion = needsConversion(inputFormat, options.service)
  const targetFormat = getTargetFormat(inputFormat, options.service)

  if (!requiresConversion) {
    if (caps.requiresFile && source.type !== "file") {
      return writeToTempFile(source)
    }
    return { source, cleanup: async () => {} }
  }

  const conversionOptions: ConversionOptions = {
    targetFormat,
    sampleRate: caps.preferredSampleRate,
    channels: caps.preferredChannels,
  }

  if (caps.requiresFile || options.preferFile) {
    return convertToFile(source, conversionOptions)
  }

  if (caps.requiresBase64) {
    return convertToBuffer(source, conversionOptions)
  }

  return convertToFile(source, conversionOptions)
}

async function writeToTempFile(source: AudioSource): Promise<PreparedAudio> {
  const tempPath = join(
    tmpdir(),
    `audio-temp-${Date.now()}${formatToExtension(source.format)}`,
  )
  const readable = toReadStream(source)
  const writable = createWriteStream(tempPath)
  await pipeline(readable, writable)

  return {
    source: audioSourceFromFile(tempPath, source.format),
    cleanup: async () => {
      await rm(tempPath, { force: true }).catch(() => {})
    },
  }
}

export async function prepareWavForService(
  source: AudioSource,
  options: {
    sampleRate?: number | undefined
    channels?: number | undefined
  } = {},
): Promise<PreparedAudio> {
  if (source.format === "wav" && source.type === "file") {
    return { source, cleanup: async () => {} }
  }

  return convertToFile(source, {
    targetFormat: "wav",
    sampleRate: options.sampleRate ?? 16000,
    channels: options.channels ?? 1,
  })
}

export function createStreamingConversion(
  source: AudioSource,
  options: ConversionOptions,
): { stream: Readable; start: () => Promise<void> } {
  const { stream, runConversion } = convertToStream(source, options)
  return { stream, start: runConversion }
}

export interface StreamForUploadOptions {
  source: AudioSource
  targetFormat: AudioFormat
  sampleRate?: number | undefined
  channels?: number | undefined
  mode?: ConversionMode | undefined
}

export interface StreamForUploadResult {
  stream: Readable
  format: AudioFormat
  cleanup: () => Promise<void>
  start?: () => Promise<void>
  mode: ConversionMode
}

export async function createStreamForUpload(
  options: StreamForUploadOptions,
): Promise<StreamForUploadResult> {
  const mode = options.mode ?? getConversionMode()
  const needsConvert = options.source.format !== options.targetFormat

  if (!needsConvert) {
    const stream = toReadStream(options.source)
    return {
      stream,
      format: options.source.format,
      cleanup: async () => {},
      mode,
    }
  }

  if (mode === "file-first") {
    const tempPath = join(
      tmpdir(),
      `upload-${Date.now()}${formatToExtension(options.targetFormat)}`,
    )

    const converter = new Converter()
    const inputPath = toFilePath(options.source)

    if (inputPath) {
      converter.createInputFromFile(inputPath)
    } else {
      const inputOpts = getFFmpegInputFormat(options.source.format)
      const inputStream = converter.createInputStream(inputOpts)
      const readable = toReadStream(options.source)
      readable.pipe(inputStream)
    }

    const outputOpts = getFFmpegFormatOptions(
      options.targetFormat,
      options.sampleRate,
      options.channels,
    )
    converter.createOutputToFile(tempPath, outputOpts)

    await converter.run()

    const stream = createReadStream(tempPath)

    return {
      stream,
      format: options.targetFormat,
      cleanup: async () => {
        await rm(tempPath, { force: true }).catch(() => {})
      },
      mode,
    }
  }

  const converter = new Converter()
  const inputPath = toFilePath(options.source)

  if (inputPath) {
    converter.createInputFromFile(inputPath)
  } else {
    const inputOpts = getFFmpegInputFormat(options.source.format)
    const inputStream = converter.createInputStream(inputOpts)
    const readable = toReadStream(options.source)
    readable.pipe(inputStream)
  }

  const outputOpts = getFFmpegFormatOptions(
    options.targetFormat,
    options.sampleRate,
    options.channels,
  )
  const outputStream = converter.createOutputStream(outputOpts)

  return {
    stream: outputStream,
    format: options.targetFormat,
    cleanup: async () => {},
    start: () => converter.run(),
    mode,
  }
}

export async function getAudioDuration(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "quiet",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ])

  const duration = parseFloat(stdout.trim())
  if (Number.isNaN(duration)) {
    throw new Error(
      `Failed to parse audio duration from ffprobe output: ${stdout}`,
    )
  }

  return duration
}
