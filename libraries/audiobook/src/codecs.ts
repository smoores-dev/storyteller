import { MediaType } from "@storyteller-platform/media-types"

export const AUDIO_ENCODERS = {
  mp3: "libmp3lame",
  aac: "aac",
  opus: "libopus",
  vorbis: "libvorbis",
  flac: "flac",
  alac: "alac",
  wav: "pcm_s16le",
  aiff: "pcm_s16be",
} as const

export type AudioEncoder = (typeof AUDIO_ENCODERS)[keyof typeof AUDIO_ENCODERS]

const AUDIO_TYPE_FOR_CODEC = new Map<string, MediaType>([
  ["mp3", MediaType.MPEG_AUDIO],
  [AUDIO_ENCODERS.mp3, MediaType.MPEG_AUDIO],
  [AUDIO_ENCODERS.aac, MediaType.MP4_AUDIO],
  ["opus", MediaType.OPUS_AUDIO],
  [AUDIO_ENCODERS.opus, MediaType.OPUS_AUDIO],
  ["vorbis", MediaType.OGG_AUDIO],
  [AUDIO_ENCODERS.vorbis, MediaType.OGG_AUDIO],
  [AUDIO_ENCODERS.flac, MediaType.FLAC_AUDIO],
  [AUDIO_ENCODERS.alac, MediaType.ALAC_AUDIO],
  ["pcm_s16le", MediaType.WAV_AUDIO],
  ["pcm_s24le", MediaType.WAV_AUDIO],
  ["pcm_s32le", MediaType.WAV_AUDIO],
  ["pcm_f32le", MediaType.WAV_AUDIO],
  ["pcm_s16be", MediaType.AIFF_AUDIO],
  ["pcm_s24be", MediaType.AIFF_AUDIO],
  ["pcm_s32be", MediaType.AIFF_AUDIO],
])

const IMAGE_TYPE_FOR_CODEC = new Map<string, MediaType>([
  ["mjpeg", MediaType.JPEG],
  ["jpeg", MediaType.JPEG],
  ["png", MediaType.PNG],
  ["webp", MediaType.WEBP],
  ["gif", MediaType.GIF],
  ["bmp", MediaType.BMP],
  ["tiff", MediaType.TIFF],
])

export function audioTypeForCodec(
  codec: string | null | undefined,
): MediaType | null {
  if (!codec) return null
  return AUDIO_TYPE_FOR_CODEC.get(codec.toLowerCase()) ?? null
}

export function imageTypeForCodec(
  codec: string | null | undefined,
): MediaType | null {
  if (!codec) return null
  return IMAGE_TYPE_FOR_CODEC.get(codec.toLowerCase()) ?? null
}
