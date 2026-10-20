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

export async function readaloudToStandaloneAudioReference(
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

  const readaloudResourceTime =
    audioReference.fragment.identifier.media.temporal.parsedTimeStart

  let readaloudTime = 0
  let found = false

  for (const entry of readaloudDurations.entries) {
    if (entry.href === resource) {
      readaloudTime += readaloudResourceTime
      found = true
      break
    }
    readaloudTime += entry.duration
  }

  if (!found) return null

  let standaloneHref: string | undefined
  let audioTime = readaloudTime
  for (const entry of audiobookDurations.entries) {
    const duration = entry.duration
    if (audioTime < duration) {
      standaloneHref = entry.href
      break
    }
    audioTime -= duration
  }

  if (!standaloneHref) return null

  const standaloneDimensions = new MediaDimensions()
  standaloneDimensions.temporal = new MediaTemporalDimension()
  standaloneDimensions.temporal.timeStart = audioTime.toString()

  const standaloneFragment = new UriFragment()
  standaloneFragment.setIdentifier("media", {
    media: standaloneDimensions,
  })

  return new UriReference(standaloneHref, standaloneFragment)
}
