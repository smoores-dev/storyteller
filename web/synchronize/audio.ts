import util from "node:util"
import { exec as execCallback } from "node:child_process"
import memoize from "memoize"

const exec = util.promisify(execCallback)

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

function trackFormatToInfo(format: FfmpegTrackFormat["format"]): TrackInfo {
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
    `ffprobe -i ${path} -show_format -v quiet -of json`,
  )
  if (stderr) {
    throw new Error(stderr)
  }
  const info = JSON.parse(stdout)
  return trackFormatToInfo(info["format"])
})

export async function getTrackDuration(path: string) {
  const info = await getTrackInfo(path)
  return info["duration"]
}
