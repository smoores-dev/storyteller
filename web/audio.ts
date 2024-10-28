import { promisify } from "node:util"
import { exec as execCallback } from "node:child_process"
import memoize from "memoize"
import { quotePath } from "./shell"
import { copyFile } from "node:fs/promises"

const exec = promisify(execCallback)

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

export const getTrackInfo = memoize(async function getTrackInfo(path: string) {
  let stdout: string
  try {
    const out = await exec(
      `ffprobe -i ${quotePath(path)} -show_format -v quiet -of json`,
    )
    if (out.stderr) throw new Error(out.stderr)
    stdout = out.stdout
  } catch {
    // Run again to get detailed ffprobe output
    const { stdout, stderr } = await exec(
      `ffprobe -i ${quotePath(path)} -show_format -of json`,
    )
    console.log(stdout)
    console.error(stderr)
    throw new Error(`Failed to parse track info from "${path}"`)
  }
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
  let stdout: string
  try {
    const out = await exec(
      `ffprobe -i ${quotePath(path)} -show_chapters -v quiet -of json`,
    )
    if (out.stderr) throw new Error(out.stderr)
    stdout = out.stdout
  } catch {
    // Run again to get detailed ffprobe output
    const { stdout, stderr } = await exec(
      `ffprobe -i ${quotePath(path)} -show_chapters -of json`,
    )
    console.log(stdout)
    console.error(stderr)
    throw new Error(`Failed to parse track info from "${path}"`)
  }

  const { chapters } = JSON.parse(stdout) as FfmpegChapters
  return chapters.map((chapter) => parseChapterInfo(chapter))
})

export async function transcodeTrack(
  path: string,
  destination: string,
  codec: string | null,
  bitrate: string | null,
) {
  if (codec == null) {
    await copyFile(path, destination)
    return
  }
  const command = "ffmpeg"
  const args = [
    "-nostdin",
    "-i",
    quotePath(path),
    "-vn",
    // Note: there seem to be issues with attempting to copy cover art
    // for some mp3s while splitting.
    // TODO: possibly re-add cover art after splitting?
    // ["-c:v", "copy", "-c:a", codec, "-b:a", bitrate ?? "32K"]
    ["-c:a", codec, "-b:a", bitrate ?? "32K"],
    "-map",
    "0",
    "-map_chapters",
    "-1",
    "-v",
    "quiet",
    `"${destination}"`,
  ]

  let stderr: string | null = null
  try {
    ;({ stderr } = await exec(`${command} ${args.join(" ")}`))
  } catch {
    // Run again to get detailed ffmpeg output
    const { stdout, stderr } = await exec(
      `${command} ${args.filter((a) => a !== "-v" && a !== "quiet").join(" ")}`,
    )
    console.log(stdout)
    console.error(stderr)
    throw new Error(`Failed to transcode track at "${path}"`)
  }

  if (stderr) {
    throw new Error(stderr)
  }
}

export async function splitTrack(
  path: string,
  from: number,
  to: number,
  destination: string,
  codec: string | null,
  bitrate: string | null,
) {
  if (from === to) return

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
    ...(typeof codec === "string"
      ? // Note: there seem to be issues with attempting to copy cover art
        // for some mp3s while splitting.
        // TODO: possibly re-add cover art after splitting?
        // ? ["-c:v", "copy", "-c:a", codec, "-b:a", bitrate ?? "32K"]
        ["-c:a", codec, "-b:a", bitrate ?? "32K"]
      : ["-c:a", "copy"]),
    "-map",
    "0",
    "-map_chapters",
    "-1",
    "-v",
    "quiet",
    `"${destination}"`,
  ]

  // TODO: If we pass an abort signal here, we may be able to prevent
  // app crashes when the worker is terminated!
  let stderr: string | null = null
  try {
    ;({ stderr } = await exec(`${command} ${args.join(" ")}`))
  } catch {
    // Run again to get detailed ffmpeg output
    const { stdout, stderr } = await exec(
      `${command} ${args.filter((a) => a !== "-v" && a !== "quiet").join(" ")}`,
    )
    console.log(stdout)
    console.error(stderr)
    throw new Error(`Failed to split track at "${path}"`)
  }

  if (stderr) {
    throw new Error(stderr)
  }
}
