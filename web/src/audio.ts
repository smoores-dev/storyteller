import { exec } from "node:child_process"
import { randomUUID } from "node:crypto"
import { copyFile } from "node:fs/promises"
import { extname } from "node:path"
import { promisify } from "util"

import memoize from "memoize"

import { logger } from "./logging"
import { quotePath } from "./shell"

const execPromise = promisify(exec)

export const COVER_IMAGE_FILE_EXTENSIONS = [".jpeg", ".jpg", ".png", ".svg"]
export const MP3_FILE_EXTENSIONS = [".mp3"]
export const MPEG4_FILE_EXTENSIONS = [".mp4", ".m4a", ".m4b"]
export const AAC_FILE_EXTENSIONS = [".aac"]
export const OGG_FILE_EXTENSIONS = [".ogg", ".oga", ".mogg"]
export const OPUS_FILE_EXTENSIONS = [".opus"]
export const WAVE_FILE_EXTENSIONS = [".wav"]
export const AIFF_FILE_EXTENSIONS = [".aiff"]
export const FLAC_FILE_EXTENSIONS = [".flac"]
export const ALAC_FILE_EXTENSIONS = [".alac"]
export const WEBM_FILE_EXTENSIONS = [".weba"]

const AUDIO_FILE_EXTENSIONS = [
  ...MP3_FILE_EXTENSIONS,
  ...AAC_FILE_EXTENSIONS,
  ...MPEG4_FILE_EXTENSIONS,
  ...OPUS_FILE_EXTENSIONS,
  ...OGG_FILE_EXTENSIONS,
  ...WAVE_FILE_EXTENSIONS,
  ...AIFF_FILE_EXTENSIONS,
  ...FLAC_FILE_EXTENSIONS,
  ...ALAC_FILE_EXTENSIONS,
  ...WEBM_FILE_EXTENSIONS,
]

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
export function isAudioFile(filenameOrExt: string): boolean {
  return AUDIO_FILE_EXTENSIONS.some((ext) => filenameOrExt.endsWith(ext))
}

export function isZipArchive(filenameOrExt: string): boolean {
  return filenameOrExt.endsWith(".zip")
}

/**
 * Determine the mime type for a given audio file. If multiple possible
 * mime types exist for an extension, will always return the audio-specific
 * type.
 *
 * @remarks
 * The mime-db used by mime-types has several overloaded extensions,
 * which means that it often returns the incorrect type for our use
 * case
 *
 * @param filenameOrExt
 * @returns The mime type
 */
export function lookupAudioMime(filenameOrExt: string): string | null {
  if (MP3_FILE_EXTENSIONS.some((ext) => filenameOrExt.endsWith(ext))) {
    return "audio/mpeg"
  }
  if (MPEG4_FILE_EXTENSIONS.some((ext) => filenameOrExt.endsWith(ext))) {
    return "audio/mp4"
  }
  if (AAC_FILE_EXTENSIONS.some((ext) => filenameOrExt.endsWith(ext))) {
    return "audio/aac"
  }
  if (OGG_FILE_EXTENSIONS.some((ext) => filenameOrExt.endsWith(ext))) {
    return "audio/ogg"
  }
  if (OPUS_FILE_EXTENSIONS.some((ext) => filenameOrExt.endsWith(ext))) {
    return "audio/opus"
  }
  if (WAVE_FILE_EXTENSIONS.some((ext) => filenameOrExt.endsWith(ext))) {
    return "audio/wav"
  }
  if (AIFF_FILE_EXTENSIONS.some((ext) => filenameOrExt.endsWith(ext))) {
    return "audio/aiff"
  }
  if (FLAC_FILE_EXTENSIONS.some((ext) => filenameOrExt.endsWith(ext))) {
    return "audio/flac"
  }
  if (WEBM_FILE_EXTENSIONS.some((ext) => filenameOrExt.endsWith(ext))) {
    return "audio/webm"
  }
  return null
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
    // cover art can be several megabytes, so we need a larger buffer
    // matches what is set in the audiobook package
    ;({ stdout, stderr } = await execPromise(command, {
      maxBuffer: 50 * 1024 * 1024,
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

type FfmpegStreams = {
  streams: FfmpegStreamInfo[]
}

type FfmpegStreamInfo = {
  disposition: {
    attached_pic: number
  }
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

  args.push("-map", "0:a")

  if (destExtension === ".mp4") {
    args.push("-map_chapters", "-1")
  }

  return args
}

export async function setCoverImage(audioPath: string, coverPath: string) {
  const ext = extname(audioPath)
  const tmpName = `/tmp/${randomUUID()}${ext}`

  const command = "ffmpeg"
  const args = [
    "-nostdin",
    "-y",
    "-i",
    quotePath(audioPath),
    "-i",
    quotePath(coverPath),
    "-map",
    "0:a",
    "-map",
    "1:v",
    "-c",
    "copy",
    "-disposition:v:0",
    "attached_pic",
    "-metadata:s:v",
    'title="Album cover"',
    "-metadata:s:v",
    'comment="Cover (front)"',
    tmpName,
  ]

  const mvCommand = "mv"
  const mvArgs = [tmpName, quotePath(audioPath)]

  await execCmd(
    `${command} ${args.join(" ")} && ${mvCommand} ${mvArgs.join(" ")}`,
  )
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

  const coverArtCommand = await constructExtractCoverArtCommand(
    path,
    destExtension,
  )

  await execCmd(`${coverArtCommand}${command} ${args.join(" ")}`)
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

  const coverArtCommand = await constructExtractCoverArtCommand(
    path,
    destExtension,
  )

  await execCmd(`${coverArtCommand}${command} ${args.join(" ")}`)
  return true
}
