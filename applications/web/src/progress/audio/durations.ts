import assert from "node:assert"
import { sep, relative, join } from "node:path"

import { LRUCache } from "lru-cache"

import { Audiobook } from "@storyteller-platform/audiobook"
import { Epub, TmpFsAdapter } from "@storyteller-platform/epub"
import { MediaType } from "@storyteller-platform/media-types"

import { getAudiobookTracks } from "@/assets/audiobooks.ts"
import { type BookWithRelations } from "@/database/books.ts"
import { getOverlayIndex } from "@/progress/mediaOverlays.ts"
import { overlayAudioFiles } from "@/progress/overlayIndex.ts"
import { getAvailableAsset } from "@/progress/references.ts"

interface AudiobookDurations {
  total: number
  entries: { href: string; duration: number }[]
}

declare global {
  var audiobookDurationCache: LRUCache<string, AudiobookDurations>
}

// oxlint-disable-next-line typescript/no-unnecessary-condition
globalThis.audiobookDurationCache ??= new LRUCache({ max: 2_500 })

export async function getAudiobookDurations(
  audiobookRecord: NonNullable<
    ReturnType<typeof getAvailableAsset<"audiobook">>
  >,
): Promise<AudiobookDurations> {
  const cacheKey = `${audiobookRecord.filepath}${audiobookRecord.fingerprint}`
  const cached = globalThis.audiobookDurationCache.get(cacheKey)
  if (cached) return cached

  const tracks = await getAudiobookTracks(audiobookRecord.filepath)
  using audiobook = await Audiobook.from(...tracks)

  const durations: AudiobookDurations = {
    total: await audiobook.getDuration(),
    entries: [],
  }

  for (const entry of audiobook.getEntries()) {
    durations.entries.push({
      href: relative(audiobookRecord.filepath, entry.filename)
        .split(sep)
        .map((segment) => encodeURIComponent(segment))
        .join("/")
        .replace(/^\//, ""),
      duration: await entry.getDuration(),
    })
  }

  globalThis.audiobookDurationCache.set(cacheKey, durations)
  return durations
}

export async function getReadaloudDurations(
  book: BookWithRelations,
): Promise<AudiobookDurations | null> {
  const readaloud = getAvailableAsset(book, "readaloud")
  assert(readaloud)

  const cacheKey = `${readaloud.filepath}${readaloud.fingerprint}`
  const cached = globalThis.audiobookDurationCache.get(cacheKey)
  if (cached) return cached

  const overlays = await getOverlayIndex(book)
  if (!overlays) return null
  const mediaOverlayAudioHrefs = overlayAudioFiles(overlays)

  using epub = await Epub.using(TmpFsAdapter).from(readaloud.filepath)

  const manifest = await epub.getManifest()

  const audioItems: string[] = []

  for (const item of Object.values(manifest)) {
    const rootHref = await epub.resolveHref(item.href, undefined, {
      toRoot: true,
    })
    if (!mediaOverlayAudioHrefs.has(rootHref)) continue
    if (
      !item.mediaType ||
      MediaType.fromMime(item.mediaType)?.kind !== "audio"
    ) {
      continue
    }
    audioItems.push(rootHref)
  }

  audioItems.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

  const epubTmpRoot = epub.adapterRootPath
  assert(epubTmpRoot)

  const audioFilepaths = audioItems.map((item) =>
    join(epubTmpRoot, decodeURIComponent(item.split("/").join(sep))),
  )

  const [first, ...rest] = audioFilepaths

  if (!first) return null

  using audiobook = await Audiobook.from(first, ...rest)

  const durations: AudiobookDurations = {
    total: await audiobook.getDuration(),
    entries: [],
  }

  for (const entry of audiobook.getEntries()) {
    durations.entries.push({
      href: relative(epubTmpRoot, entry.filename)
        .split(sep)
        .map((segment) => encodeURIComponent(segment))
        .join("/")
        .replace(/^\//, ""),
      duration: await entry.getDuration(),
    })
  }

  globalThis.audiobookDurationCache.set(cacheKey, durations)
  return durations
}
