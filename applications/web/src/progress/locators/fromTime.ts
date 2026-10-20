import {
  type Audiobook,
  type AudiobookEntry,
} from "@storyteller-platform/audiobook"
import { MediaType } from "@storyteller-platform/media-types"

import { type ReadiumLocator } from "@/database/positions.ts"

export async function locatorFromTime(
  audiobook: Audiobook,
  href: string,
  time: number,
): Promise<ReadiumLocator | null> {
  const mediaType = MediaType.fromPath(href)
  if (!mediaType) return null

  const resource = decodeURIComponent(href)

  const totalDuration = await audiobook.getDuration()

  const chapters = await audiobook.getChapters()
  const entries = audiobook.getEntries()

  let entry: AudiobookEntry | null = null

  for (const e of entries) {
    if (
      e.filename.endsWith(resource) &&
      (!entry || e.filename.length < entry.filename.length)
    ) {
      entry = e
    }
  }

  if (!entry) return null

  const title =
    chapters.find(
      (chapter) =>
        chapter.filename === entry.filename &&
        chapter.start <= time &&
        chapter.end > time,
    )?.title ?? undefined

  const progression = time / (await entry.getDuration())

  let totalProgressDuration = 0

  for (const e of entries) {
    if (e.filename === entry.filename) {
      totalProgressDuration += time
      break
    }
    totalProgressDuration += await e.getDuration()
  }

  return {
    href: href,
    title,
    type: mediaType.mime,
    locations: {
      fragments: [`t=${time}`],
      progression,
      totalProgression: totalProgressDuration / totalDuration,
    },
  }
}
