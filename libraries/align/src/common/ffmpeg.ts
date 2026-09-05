import { exec } from "node:child_process"
import { copyFile } from "node:fs/promises"
import { extname } from "node:path"
import { promisify } from "node:util"

import memoize from "memoize"
import { type Logger } from "pino"

import { AUDIO_ENCODERS, canCopyCodec } from "@storyteller-platform/audiobook"
import { MediaType } from "@storyteller-platform/media-types"

import { type AudioEncoding } from "../process/AudioEncoding.ts"

import { quotePath } from "./shell.ts"

const execPromise = promisify(exec)

async function execCmd(
  command: string,
  logger?: Logger | null,
  signal?: AbortSignal | null,
) {
  try {
    // cover art can be several megabytes, so we need a larger buffer
    // matches what is set in the audiobook package
    const { stdout } = await execPromise(command, {
      maxBuffer: 50 * 1024 * 1024,
      signal: signal ?? undefined,
    })

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

    const execErr = error as { stderr?: string; stdout?: string }

    logger?.error(error)
    if (execErr.stdout) logger?.info(execErr.stdout)

    const errorDetail =
      execErr.stderr || execErr.stdout || `Command failed: ${command}`

    throw new Error(errorDetail)
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
    `ffprobe -v error -i ${quotePath(path)} -show_format -of json`,
    logger,
  )
  const info = JSON.parse(stdout) as FfmpegTrackFormat
  return parseTrackInfo(info.format)
})

export async function getTrackDuration(path: string, logger?: Logger) {
  const info = await getTrackInfo(path, logger)
  return info["duration"]
}

/**
 * CBR bitrates (bps) offered for MP3 output, roughly matching LAME -V9..-V0
 */
export const MP3_CBR_BITRATES = [
  64_000, 80_000, 96_000, 112_000, 128_000, 160_000, 192_000, 224_000, 256_000,
  320_000,
] as const

/**
 * How many audio packets to sample when probing for a variable bitrate
 */
const VBR_PROBE_PACKET_COUNT = 50

/**
 * Maximum number of distinct packet sizes we tolerate before calling an MP3
 * stream variable bitrate.
 * CBR can have SOME variation but really only one or two distinct sizes
 */
const MP3_CBR_MAX_DISTINCT_SIZES = 2

/**
 * intros can be kinda unreliable as they are often very quiet
 * so we seek some time in to get a more representative sample
 */
const VBR_PROBE_MIN_SEEKABLE_SECONDS = 180

type FfprobeFormatDurationOutput = {
  format?: { duration?: string }
}

type FfprobePacketsOutput = {
  packets?: Array<{ size?: string }>
}

async function probeAudioDuration(path: string): Promise<number | null> {
  const stdout = await execCmd(
    `ffprobe -i ${quotePath(path)} -v error -show_entries format=duration -output_format json`,
  )
  const { format } = JSON.parse(stdout) as FfprobeFormatDurationOutput
  const duration = Number(format?.duration)
  return Number.isFinite(duration) && duration > 0 ? duration : null
}

async function probePacketSizes(
  path: string,
  startSeconds: number,
): Promise<number[]> {
  // `START%+#N`: seek to START seconds, read N packets (no START = from start).
  const interval =
    startSeconds > 0
      ? `${startSeconds}%+#${VBR_PROBE_PACKET_COUNT}`
      : `%+#${VBR_PROBE_PACKET_COUNT}`

  const stdout = await execCmd(
    `ffprobe -i ${quotePath(path)} -v error -select_streams a:0 -read_intervals "${interval}" -show_entries packet=size -output_format json`,
  )

  const { packets } = JSON.parse(stdout) as FfprobePacketsOutput
  return (packets ?? [])
    .map((packet) => Number(packet.size))
    .filter((size) => Number.isFinite(size) && size > 0)
}

/**
 * Detect whether an MP3 file uses a variable bitrate
 * Does this by sampling the first few packets and checking if the sizes are different
 * CBR MP3 files will have the same packet size for the entire file
 *
 * Can't really trust the reported bitrate to tell CBR from VBR
 * LAME writes a Xing header carrying the *average* bitrate,
 * which ffprobe surfaces as a normal per-stream `bit_rate`,
 * so a VBR file looks identical to a CBR one by that measure.
 */
export async function isVbrMp3(path: string): Promise<boolean> {
  if (extname(path).toLowerCase() !== ".mp3") return false

  const duration = await probeAudioDuration(path)
  const startSeconds =
    duration && duration > VBR_PROBE_MIN_SEEKABLE_SECONDS
      ? Math.floor(duration / 3)
      : 0

  let sizes = await probePacketSizes(path, startSeconds)
  // failsafe in case something goes wrong
  if (sizes.length === 0 && startSeconds > 0) {
    sizes = await probePacketSizes(path, 0)
  }

  if (sizes.length === 0) return false

  const distinctSizes = new Set(sizes).size
  return distinctSizes > MP3_CBR_MAX_DISTINCT_SIZES
}

// Pick the nearest CBR bitrate at or above the source's average.
export function selectCbrBitrate(averageBitrate: number): number {
  return (
    MP3_CBR_BITRATES.find((tier) => tier >= averageBitrate) ??
    MP3_CBR_BITRATES.at(-1) ??
    MP3_CBR_BITRATES[0]
  )
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

interface FfmpegArgumentOptions {
  sourceExtension: string
  destExtension: string
  codec: string | null
  bitrate: string | null
}

function commonFfmpegArguments(options: FfmpegArgumentOptions) {
  const { sourceExtension, destExtension, codec, bitrate } = options
  const args = ["-vn"]

  if (codec) {
    args.push("-c:a", codec)

    if (codec === AUDIO_ENCODERS.opus) {
      args.push("-b:a", bitrate && /^\d+[kK]$/i.test(bitrate) ? bitrate : "32K")
    } else if (codec === AUDIO_ENCODERS.mp3 && bitrate) {
      // MP3 is always CBR for accurate seeking; bitrate is a `-b:a` value.
      args.push("-b:a", bitrate)
    }
  } else if (
    canCopyCodec(
      MediaType.fromExtension(sourceExtension),
      MediaType.fromExtension(destExtension),
    )
  ) {
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
    ...commonFfmpegArguments({
      sourceExtension: extname(input),
      destExtension: extname(output),
      codec: encoding?.codec ?? null,
      bitrate: encoding?.bitrate ?? null,
    }),
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
  const container = MediaType.fromPath(input)
  if (
    !encoding?.codec &&
    container !== null &&
    container === MediaType.fromPath(output)
  ) {
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
    ...commonFfmpegArguments({
      sourceExtension: extname(input),
      destExtension: extname(output),
      codec: encoding?.codec ?? null,
      bitrate: encoding?.bitrate ?? null,
    }),
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
