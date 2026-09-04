import { MediaType } from "@storyteller-platform/media-types"

import { audioTypeForCodec } from "./codecs.ts"

const PLAYABLE_CONTAINER = new Map<MediaType, MediaType>([
  [MediaType.MPEG_AUDIO, MediaType.MPEG_AUDIO],
  [MediaType.MP4_AUDIO, MediaType.MP4_AUDIO],
  [MediaType.AAC_AUDIO, MediaType.MP4_AUDIO],
  [MediaType.OGG_AUDIO, MediaType.MP4_AUDIO],
  [MediaType.OPUS_AUDIO, MediaType.MP4_AUDIO],
])

export function outputContainer(
  codec: string | null | undefined,
  source: MediaType | null,
): MediaType | null {
  const produced =
    audioTypeForCodec(codec) ?? (source?.is("audio") ? source : null)
  if (produced === null) return null
  return PLAYABLE_CONTAINER.get(produced) ?? produced
}

export function canCopyCodec(
  from: MediaType | null,
  to: MediaType | null,
): boolean {
  if (from !== null && from === to) return true
  return to === MediaType.MP4_AUDIO
}
