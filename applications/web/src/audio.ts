import { execFile } from "node:child_process"
import { extname } from "node:path"
import { promisify } from "util"

import memoize from "memoize"

import { AUDIO_ENCODERS, canCopyCodec } from "@storyteller-platform/audiobook"
import { MediaType } from "@storyteller-platform/media-types"

import { logger } from "./logging"

const execFilePromise = promisify(execFile)

export function isAudioFile(nameOrPath: string): boolean {
  return MediaType.fromPath(nameOrPath)?.kind === "audio"
}

export function isZipArchive(nameOrPath: string): boolean {
  return MediaType.fromPath(nameOrPath)?.kind === "archive"
}

export function lookupAudioMime(nameOrPath: string): string | null {
  const mediaType = MediaType.fromPath(nameOrPath)
  return mediaType?.is("audio") ? mediaType.mime : null
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

async function execCmd(command: string, args: string[]) {
  try {
    // cover art can be several megabytes, so we need a larger buffer
    // matches what is set in the audiobook package
    const { stdout } = await execFilePromise(command, args, {
      maxBuffer: 50 * 1024 * 1024,
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

    logger.error(error)
    if (error && typeof error === "object" && "stderr" in error) {
      throw new Error(String(error.stderr))
    }
    throw error
  }
}

export const getTrackInfo = memoize(async function getTrackInfo(path: string) {
  const stdout = await execCmd("ffprobe", [
    "-i",
    path,
    "-show_format",
    "-of",
    "json",
  ])
  const info = JSON.parse(stdout) as FfmpegTrackFormat
  return parseTrackInfo(info.format)
})

export async function getTrackDuration(path: string) {
  const info = await getTrackInfo(path)
  return info["duration"]
}

type FfmpegChapters = {
  chapters: FfmpegChapterInfo[]
}

type FfmpegChapterInfo = {
  id: number
  time_base: string
  start: number
  start_time: string
  end: number
  end_time: string
  tags: {
    title: string
  }
}

export type ChapterInfo = {
  id: number
  startTime: number
  endTime: number
  title: string
}

function parseChapterInfo(ffmpegChapterInfo: FfmpegChapterInfo): ChapterInfo {
  return {
    id: ffmpegChapterInfo.id,
    startTime: parseFloat(ffmpegChapterInfo.start_time),
    endTime: parseFloat(ffmpegChapterInfo.end_time),
    title: ffmpegChapterInfo.tags.title,
  }
}

export const getTrackChapters = memoize(async function getTrackChapters(
  path: string,
) {
  const stdout = await execCmd("ffprobe", [
    "-i",
    path,
    "-show_chapters",
    "-of",
    "json",
  ])

  const { chapters } = JSON.parse(stdout) as FfmpegChapters
  return chapters.map((chapter) => parseChapterInfo(chapter))
})

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
      ...(codec === AUDIO_ENCODERS.opus
        ? ["-b:a", bitrate && /^\d+[kK]$/i.test(bitrate) ? bitrate : "32K"]
        : []),
      ...(codec === AUDIO_ENCODERS.mp3 && bitrate ? ["-b:a", bitrate] : []),
    )
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

export async function splitTrack(
  path: string,
  from: number,
  to: number,
  destination: string,
  codec: string | null,
  bitrate: string | null,
) {
  if (from === to) return false
  const sourceExtension = extname(path)
  const destExtension = extname(destination)

  await execCmd("ffmpeg", [
    "-nostdin",
    "-ss",
    String(from),
    "-to",
    String(to),
    "-i",
    path,
    ...commonFfmpegArguments(sourceExtension, destExtension, codec, bitrate),
    destination,
  ])
  return true
}
