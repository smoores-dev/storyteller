import assert from "node:assert"

import {
  MediaDimensions,
  MediaTemporalDimension,
  UriFragment,
} from "@storyteller-platform/uri-fragment"

import { type BookWithRelations } from "@/database/books.ts"
import {
  getAudiobookDurations,
  getReadaloudDurations,
} from "@/progress/audio/durations.ts"
import { getAvailableAsset } from "@/progress/references.ts"
import { UriReference } from "@/progress/uriReference.ts"

export async function standaloneToReadaloudAudioReference(
  book: BookWithRelations,
  audioReference: UriReference,
): Promise<UriReference | null> {
  const readaloud = getAvailableAsset(book, "readaloud")
  if (!readaloud) return null
  const audiobookRecord = getAvailableAsset(book, "audiobook")
  if (!audiobookRecord) return null

  const resource = audioReference.hrefPathname

  const readaloudDurations = await getReadaloudDurations(book)
  if (!readaloudDurations) return null

  const audiobookDurations = await getAudiobookDurations(audiobookRecord)

  if (Math.abs(readaloudDurations.total - audiobookDurations.total) > 3) {
    // The audio in the readaloud doesn't match that in the audiobook
    return null
  }

  assert(audioReference.fragment.identifier?.kind === "media")
  assert(audioReference.fragment.identifier.media.temporal)

  const standaloneResourceTime =
    audioReference.fragment.identifier.media.temporal.parsedTimeStart

  let standaloneTime = 0
  let found = false

  for (const entry of audiobookDurations.entries) {
    if (entry.href === resource) {
      standaloneTime += standaloneResourceTime
      found = true
      break
    }
    standaloneTime += entry.duration
  }
  if (!found) return null

  let readaloudHref: string | undefined
  let audioTime = standaloneTime
  for (const entry of readaloudDurations.entries) {
    const duration = entry.duration
    if (audioTime < duration) {
      readaloudHref = entry.href
      break
    }
    audioTime -= duration
  }

  if (!readaloudHref) return null

  const readaloudDimensions = new MediaDimensions()
  readaloudDimensions.temporal = new MediaTemporalDimension()
  readaloudDimensions.temporal.timeStart = audioTime.toString()

  const readaloudFragment = new UriFragment()
  readaloudFragment.setIdentifier("media", {
    media: readaloudDimensions,
  })

  return new UriReference(readaloudHref, readaloudFragment)
}
