import { exec } from "node:child_process"
import memoize from "memoize"
import { quotePath } from "./shell"
import { extname } from "node:path"
import { copyFile } from "node:fs/promises"
import { logger } from "./logging"

export const COVER_IMAGE_FILE_EXTENSIONS = [".jpeg", ".jpg", ".png"]
export const MP3_FILE_EXTENSIONS = [".mp3"]
export const MPEG4_FILE_EXTENSIONS = [".mp4", ".m4a", ".m4b"]
export const AUDIO_FILE_EXTENSIONS = [
  ...MP3_FILE_EXTENSIONS,
  ...MPEG4_FILE_EXTENSIONS,
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
  const process = exec(command)
  let stdout = ""
  let stderr = ""
  process.stdout?.on("data", (chunk: string) => {
    stdout += chunk
  })
  process.stderr?.on("data", (chunk: string) => {
    stderr += chunk
  })
  try {
    await new Promise<void>((resolve, reject) => {
      process.on("exit", (code) => {
        if (code === 0) {
          resolve()
          return
        }
        reject(new Error(`Process failed with exit code: ${code}`))
      })
      process.on("error", reject)
    })
  } catch (e) {
    logger.error(e)
    logger.info(stdout)
    throw new Error(stderr)
  }
  return stdout
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
  return false
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
    "-vn",
    ...(codec ? ["-c:a", codec] : []),
    ...(codec === "libopus" ? ["-b:a", bitrate || "32K"] : []),
    ...(codec === "libmp3lame" && bitrate ? ["-q:a", bitrate] : []),
    ...(destExtension === ".mp4" ? ["-map", "0", "-map_chapters", "-1"] : []),
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

  const copy = !codec && areSameType(sourceExtension, destExtension)

  const command = "ffmpeg"
  const args = [
    "-nostdin",
    "-ss",
    from,
    "-to",
    to,
    "-i",
    quotePath(path),
    "-vn",
    ...(copy ? ["-c", "copy"] : []),
    ...(codec ? ["-c:a", codec] : []),
    ...(codec === "libopus" ? ["-b:a", bitrate || "32K"] : []),
    ...(codec === "libmp3lame" && bitrate ? ["-q:a", bitrate] : []),
    ...(destExtension === ".mp4" ? ["-map", "0", "-map_chapters", "-1"] : []),
    `"${destination}"`,
  ]

  await execCmd(`${command} ${args.join(" ")}`)
  return true
}
