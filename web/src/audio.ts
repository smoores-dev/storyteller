import { exec } from "node:child_process"
import memoize from "memoize"
import { quotePath } from "./shell"
import { extname } from "node:path"
import { copyFile } from "node:fs/promises"
import { logger } from "./logging"
import { lookup } from "mime-types"
import { promisify } from "util"

const execPromise = promisify(exec)

export const COVER_IMAGE_FILE_EXTENSIONS = [".jpeg", ".jpg", ".png"]
export const MP3_FILE_EXTENSIONS = [".mp3"]
export const MPEG4_FILE_EXTENSIONS = [".mp4", ".m4a", ".m4b", ".aac"]
export const OPUS_FILE_EXTENSIONS = [".ogg", ".oga", ".opus"]

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

/**
 * Determines if a file with the given name or extension might contain audio.
 *
 * @remarks
 * Note that extension-based file type determination is only a heuristic; both
 * false negatives and false positives are possible.  False positives are
 * especially likely, since many file types can optionally contain audio.
 *
 * @param ext The extension (or complete filename) to check
 * @returns Whether the file *may* contain audio
 */
export function isAudioFile(ext: string): boolean {
  // The mime-db package does not recognize m4b (jshttp/mime-db#357).
  if (ext.endsWith(".m4b")) {
    return true
  }

  const mimetype = lookup(ext)
  return mimetype
    ? mimetype.startsWith("audio") || mimetype.startsWith("video")
    : false
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

async function execCmd(command: string) {
  let stdout: string = ""
  let stderr: string = ""
  try {
    ;({ stdout, stderr } = await execPromise(command))
    return stdout
  } catch (error) {
    logger.error(error)
    logger.info(stdout)
    throw new Error(stderr)
  }
}

export const getTrackInfo = memoize(async function getTrackInfo(path: string) {
  const stdout = await execCmd(
    `ffprobe -i ${quotePath(path)} -show_format -of json`,
  )
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
  const stdout = await execCmd(
    `ffprobe -i ${quotePath(path)} -show_chapters -of json`,
  )

  const { chapters } = JSON.parse(stdout) as FfmpegChapters
  return chapters.map((chapter) => parseChapterInfo(chapter))
})

function areSameType(extensionA: string, extensionB: string) {
  if (extensionA === extensionB) {
    return true
  }
  if (
    MPEG4_FILE_EXTENSIONS.includes(extensionA) &&
    MPEG4_FILE_EXTENSIONS.includes(extensionB)
  ) {
    return true
  }
  if (
    MP3_FILE_EXTENSIONS.includes(extensionA) &&
    MP3_FILE_EXTENSIONS.includes(extensionB)
  ) {
    return true
  }
  if (
    OPUS_FILE_EXTENSIONS.includes(extensionA) &&
    OPUS_FILE_EXTENSIONS.includes(extensionB)
  ) {
    return true
  }
  return false
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
      ...(codec === "libopus" ? ["-b:a", bitrate || "32K"] : []),
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

  if (destExtension === ".mp4") {
    args.push("-map", "0", "-map_chapters", "-1")
  }

  return args
}

export async function transcodeTrack(
  path: string,
  destination: string,
  codec: string | null,
  bitrate: string | null,
) {
  const sourceExtension = extname(path)
  const destExtension = extname(destination)

  if (!codec && areSameType(sourceExtension, destExtension)) {
    await copyFile(path, destination)
    return
  }

  const command = "ffmpeg"
  const args = [
    "-nostdin",
    "-i",
    quotePath(path),
    ...commonFfmpegArguments(sourceExtension, destExtension, codec, bitrate),
    `"${destination}"`,
  ]

  await execCmd(`${command} ${args.join(" ")}`)
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

  const command = "ffmpeg"
  const args = [
    "-nostdin",
    "-ss",
    from,
    "-to",
    to,
    "-i",
    quotePath(path),
    ...commonFfmpegArguments(sourceExtension, destExtension, codec, bitrate),
    `"${destination}"`,
  ]

  await execCmd(`${command} ${args.join(" ")}`)
  return true
}
