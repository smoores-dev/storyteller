import { promisify } from "node:util"
import { exec as execCallback } from "node:child_process"
import memoize from "memoize"

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
    tags: {
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
  tags: {
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
  }
}

export const getTrackInfo = memoize(async function getTrackInfo(path: string) {
  const { stdout, stderr } = await exec(
    `ffprobe -i "${path.replaceAll(/"/g, '\\"')}" -show_format -v quiet -of json`,
  )
  if (stderr) {
    throw new Error(stderr)
  }
  const info = JSON.parse(stdout) as FfmpegTrackFormat
  return parseTrackInfo(info["format"])
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
  const { stdout, stderr } = await exec(
    `ffprobe -i "${path.replaceAll(/"/g, '\\"')}" -show_chapters -v quiet -of json`,
  )
  if (stderr) {
    throw new Error(stderr)
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
  const command = "ffmpeg"
  const args = [
    "-nostdin",
    "-i",
    `"${path.replaceAll(/"/g, '\\"')}"`,
    ...(typeof codec === "string"
      ? ["-c:v", "copy", "-c:a", codec, "-b:a", bitrate ?? "32K"]
      : ["-c", "copy"]),
    "-map",
    "0",
    "-map_chapters",
    "-1",
    "-v",
    "quiet",
    `"${destination}"`,
  ]

  const { stderr } = await exec(`${command} ${args.join(" ")}`)

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
    `"${path.replaceAll(/"/g, '\\"')}"`,
    ...(typeof codec === "string"
      ? ["-c:v", "copy", "-c:a", codec, "-b:a", bitrate ?? "32K"]
      : ["-c", "copy"]),
    "-map",
    "0",
    "-map_chapters",
    "-1",
    "-v",
    "quiet",
    `"${destination}"`,
  ]

  const { stderr } = await exec(`${command} ${args.join(" ")}`)

  if (stderr) {
    throw new Error(stderr)
  }
}
