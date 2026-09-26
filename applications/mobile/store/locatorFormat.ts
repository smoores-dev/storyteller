import {
  type ReadiumClip,
  type ReadiumLocator,
} from "@/modules/readium/src/Readium.types"

const AUDIO_HREF_PATTERN =
  /\.(aac|m4a|m4b|mp3|mp4|mpga|oga|oga|opus|opus|wav|weba)$/

/**
 * Strips the fragment (both `#` and the `%23` form Readium produces for hrefs
 * with spaces), percent-decodes, and normalizes the result.
 */
export function normalizeResourceHref(href: string | null | undefined): string {
  if (!href) return ""

  const fragmentIndex = href.search(/#|%23/i)
  const withoutFragment =
    fragmentIndex === -1 ? href : href.slice(0, fragmentIndex)

  let decoded = withoutFragment
  try {
    decoded = decodeURIComponent(withoutFragment)
  } catch {
    // A malformed escape is not a reason to fail the comparison
  }

  return decoded.replace(/^\.\//, "").replace(/^\/+/, "").toLowerCase()
}

export function isStandaloneAudiobookLocator(
  locator: ReadiumLocator | null | undefined,
  audiobookHrefs: string[] = [],
): boolean {
  if (!locator?.href) return false

  if (locator.type?.startsWith("audio/")) return true

  const href = normalizeResourceHref(locator.href)
  if (!href) return false

  if (
    audiobookHrefs.some(
      (audiobookHref) => normalizeResourceHref(audiobookHref) === href,
    )
  ) {
    return true
  }

  return AUDIO_HREF_PATTERN.test(href)
}

/**
 * Maps a progression through the book onto the position list of a text format,
 * returning the last position at or before it.
 */
export function positionForProgression(
  positions: ReadiumLocator[] | null | undefined,
  totalProgression?: number,
): ReadiumLocator | null {
  const [firstPosition] = positions ?? []
  if (!firstPosition) return null

  if (totalProgression === undefined) return firstPosition

  let match = firstPosition
  for (const position of positions!) {
    const positionProgression = position.locations?.totalProgression
    if (positionProgression === undefined) continue
    if (positionProgression > totalProgression) break
    match = position
  }

  return match
}

/**
 * The first media overlay clip of a resource, used as a resume point when a
 * locator identifies a resource but not a fragment inside it.
 */
export function firstClipInResource(
  clips: ReadiumClip[] | null | undefined,
  href: string,
): ReadiumClip | null {
  const resource = normalizeResourceHref(href)
  if (!resource) return null

  return (
    clips?.find(
      (clip) => normalizeResourceHref(clip.textResource) === resource,
    ) ?? null
  )
}
