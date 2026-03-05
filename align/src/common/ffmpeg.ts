import { exec } from "node:child_process"
import { copyFile } from "node:fs/promises"
import { extname } from "node:path"
import { promisify } from "node:util"

import memoize from "memoize"
import { type Logger } from "pino"

import { type AudioEncoding } from "../process/AudioEncoding.ts"
import { areSameType } from "../process/mime.ts"

import { quotePath } from "./shell.ts"

const execPromise = promisify(exec)

async function execCmd(
  command: string,
  logger?: Logger | null,
  signal?: AbortSignal | null,
) {
  let stdout: string = ""
  let stderr: string = ""
  try {
    // cover art can be several megabytes, so we need a larger buffer
    // matches what is set in the audiobook package
    ;({ stdout, stderr } = await execPromise(command, {
      maxBuffer: 50 * 1024 * 1024,
      signal: signal ?? undefined,
    }))
    return stdout
  } catch (error) {
    if (
      error instanceof RangeError &&
      error.message.includes("stdout maxBuffer length exceeded")
    ) {
      throw new Error(
        "stdout maxBuffer length exceeded. This likely means that youre trying to process a very large file, and the ffmpeg process is running out of memory. Maybe check the image size of your cover art.",
      )
    }

    logger?.error(error)
    logger?.info(stdout)
    throw new Error(stderr)
  }
}

type FfmpegTrackFormat = {
  format: {
    filename: string
    nb_streams: number
    nb_programs: number
    format_name: string
    format_long_name: string
    start_time: string
    duration: string
    size: string
    bit_rate: string
    probe_score: number
    tags?: {
      major_brand: string
      minor_version: string
      compatible_brands: string
      title: string
      track: string
      album: string
      genre: string
      artist: string
      encoder: string
      media_type: string
    }
  }
}

export const getTrackInfo = memoize(async function getTrackInfo(
  path: string,
  logger?: Logger,
) {
  const stdout = await execCmd(
    `ffprobe -i ${quotePath(path)} -show_format -of json`,
    logger,
  )
  const info = JSON.parse(stdout) as FfmpegTrackFormat
  return parseTrackInfo(info.format)
})

export async function getTrackDuration(path: string, logger?: Logger) {
  const info = await getTrackInfo(path, logger)
  return info["duration"]
}

type TrackInfo = {
  filename: string
  nbStreams: number
  nbPrograms: number
  formatName: string
  formatLongName: string
  startTime: number
  duration: number
  size: number
  bitRate: number
  probeScore: number
  tags?: {
    majorBrand: string
    minorVersion: string
    compatibleBrands: string
    title: string
    track: string
    album: string
    genre: string
    artist: string
    encoder: string
    mediaType: string
  }
}

function parseTrackInfo(format: FfmpegTrackFormat["format"]): TrackInfo {
  return {
    filename: format.filename,
    nbStreams: format.nb_streams,
    nbPrograms: format.nb_programs,
    formatName: format.format_name,
    formatLongName: format.format_long_name,
    startTime: parseFloat(format.start_time),
    duration: parseFloat(format.duration),
    size: parseInt(format.size, 10),
    bitRate: parseInt(format.bit_rate, 10),
    probeScore: format.probe_score,
    ...(format.tags && {
      tags: {
        majorBrand: format.tags.major_brand,
        minorVersion: format.tags.minor_version,
        compatibleBrands: format.tags.compatible_brands,
        title: format.tags.title,
        track: format.tags.track,
        album: format.tags.album,
        genre: format.tags.genre,
        artist: format.tags.artist,
        encoder: format.tags.encoder,
        mediaType: format.tags.media_type,
      },
    }),
  }
}

type FfmpegStreams = {
  streams: FfmpegStreamInfo[]
}

type FfmpegStreamInfo = {
  disposition: {
    attached_pic: number
  }
}

const hasCoverArt = memoize(async function hasCoverArt(path: string) {
  try {
    const { stdout } = await execPromise(
      `ffprobe -v quiet -show_streams -of json ${quotePath(path)}`,
    )

    const { streams } = JSON.parse(stdout) as FfmpegStreams

    return streams.some((stream) => stream.disposition.attached_pic === 1)
  } catch {
    return null
  }
})

async function constructExtractCoverArtCommand(
  source: string,
  destExtension: string,
) {
  if (destExtension === ".wav" || !(await hasCoverArt(source))) {
    return ""
  }

  const command = "ffmpeg"
  const args = [
    "-nostdin",
    "-i",
    quotePath(source),
    "-map",
    "0:v",
    "-c:v",
    "copy",
    "-vframes",
    "1",
    "-f",
    "image2",
    "-update",
    "1",
    "pipe:1",
  ]

  return `${command} ${args.join(" ")} | `
}

function commonFfmpegArguments(
  sourceExtension: string,
  destExtension: string,
  codec: string | null,
  bitrate: string | null,
) {
  const args = ["-vn"]

  if (codec) {
    args.push(
      "-c:a",
      codec,
      ...(codec === "libopus"
        ? ["-b:a", bitrate && /^\d+[kK]$/i.test(bitrate) ? bitrate : "32K"]
        : []),
      ...(codec === "libmp3lame" && bitrate ? ["-q:a", bitrate] : []),
    )
  } else if (
    areSameType(sourceExtension, destExtension) ||
    destExtension == ".mp4"
  ) {
    // Ideally this would be a check for whether the container could handle the
    // input, but it seems like ffmpeg doesn't make that easy to figure out.
    // Right now this only comes up when remuxing ogg to mp4, where copy works.
    args.push("-c:a", "copy")
  }

  args.push("-map", "0:a")

  if (destExtension === ".mp4") {
    args.push("-map_chapters", "-1")
  }

  return args
}

export async function splitFile(
  input: string,
  output: string,
  start: number,
  end: number,
  encoding?: AudioEncoding | null,
  signal?: AbortSignal | null,
  logger?: Logger | null,
) {
  if (start === end) return false

  logger?.info(
    `Splitting ${input} start: ${start} end: ${end}${encoding?.codec ? ` codec: ${encoding.codec}` : ""}`,
  )

  const command = "ffmpeg"
  const args = [
    "-nostdin",
    "-ss",
    start,
    "-to",
    end,
    "-i",
    quotePath(input),
    ...commonFfmpegArguments(
      extname(input),
      extname(output),
      encoding?.codec ?? null,
      encoding?.bitrate ?? null,
    ),
    quotePath(output),
  ]

  const coverArtCommand = await constructExtractCoverArtCommand(
    input,
    extname(output),
  )

  await execCmd(
    `${coverArtCommand}${command} ${args.join(" ")}`,
    logger,
    signal,
  )

  return true
}

export async function transcodeFile(
  input: string,
  output: string,
  encoding?: AudioEncoding | null,
  signal?: AbortSignal | null,
  logger?: Logger | null,
) {
  if (!encoding?.codec && areSameType(input, output)) {
    logger?.info(
      `Input and output container and codec are the same, copying ${input} to output directory`,
    )
    await copyFile(input, output)
    return
  }

  logger?.info(
    `Transcoding ${input}${encoding?.codec ? ` codec: ${encoding.codec}` : ""}`,
  )

  const command = "ffmpeg"
  const args = [
    "-nostdin",
    "-i",
    quotePath(input),
    ...commonFfmpegArguments(
      extname(input),
      extname(output),
      encoding?.codec ?? null,
      encoding?.bitrate ?? null,
    ),
    quotePath(output),
  ]

  const coverArtCommand = await constructExtractCoverArtCommand(
    input,
    extname(output),
  )

  await execCmd(
    `${coverArtCommand}${command} ${args.join(" ")}`,
    logger,
    signal,
  )
  return true
}
