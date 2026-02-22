import { tmpdir } from "node:os"
import { join } from "node:path"

import { Converter } from "ffmpeg-stream"

import { type AudioFormat, formatToExtension } from "./audio/AudioFormat.ts"

export async function fileToWav(
  file: string,
  options: { sampleRate?: number; channels?: number } = {},
): Promise<string> {
  const converter = new Converter()
  const outputPath = join(tmpdir(), `vad-${Date.now()}.wav`)
  converter.createInputFromFile(file)
  converter.createOutputToFile(outputPath, {
    f: "wav",
    ar: String(options.sampleRate ?? 16000),
    ac: String(options.channels ?? 1),
  })

  await converter.run()
  return outputPath
}

export async function fileToFormat(
  file: string,
  targetFormat: AudioFormat,
  options: { sampleRate?: number; channels?: number } = {},
): Promise<string> {
  const converter = new Converter()
  const ext = formatToExtension(targetFormat)
  const outputPath = join(tmpdir(), `convert-${Date.now()}${ext}`)
  converter.createInputFromFile(file)
  converter.createOutputToFile(
    outputPath,
    getFormatOptions(targetFormat, options),
  )

  await converter.run()
  return outputPath
}

function getFormatOptions(
  format: AudioFormat,
  options: { sampleRate?: number; channels?: number },
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

  if (options.sampleRate) {
    opts["ar"] = String(options.sampleRate)
  }
  if (options.channels) {
    opts["ac"] = String(options.channels)
  }

  return opts
}
