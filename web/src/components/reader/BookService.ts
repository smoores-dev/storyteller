/**
 * Web BookService - Similar to iOS BookService.swift
 *
 * Provides structured access to publication data, media overlays, and fragment navigation.
 * Implements the same core methods as the iOS version but adapted for web/TypeScript.
 */

import type { UUID } from "crypto"

import {
  type GuidedNavigationDocument,
  type GuidedNavigationObject,
  type Link,
  Locator,
  LocatorLocations,
  type Publication,
} from "@readium/shared"

import type { ReadiumServiceError } from "@/services/readiumService"
import {
  getPositions,
  getPublication,
  getResource,
  registerPositions,
  registerResource,
} from "@/store/readerRegistry"
import type { ReadingMode } from "@/store/slices/readingSessionSlice"

export type TextFragment = {
  href: string
  fragment: string
  locator?: Locator | null
}

export type AudioClip = {
  audioResource: string
  fragmentId: string | undefined
  start: number
  end: number
  duration: number
}

export type TocItem = {
  id: string
  title: string | undefined
  href: string
  level: number
  locator: Locator | null
}

export class BookServiceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BookServiceError"
  }
}

export function isReadiumServiceError(
  error: unknown,
): error is ReadiumServiceError {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "ReadiumServiceError"
  )
}

/**
 * Transform something like /Audio/01.mp3 to /api/v2/books/123/read/01.mp3
 */
export function getApiUrlFromResourceHref(
  uuid: UUID,
  clipUrl: string,
  mode: "read" | "listen" = "read",
): string {
  return `${window.location.origin}/api/v2/books/${uuid}/${mode}/${clipUrl}`
}

const regex = /.*\/api\/v2\/books\/.*\/(read|listen)\//

export function getResourceHrefFromApiUrl(apiUrl: string): string {
  if (URL.canParse(apiUrl)) {
    const url = new URL(apiUrl)
    url.searchParams.delete("v")
    return url.toString().replace(regex, "")
  }

  return apiUrl.replace(regex, "")
}

export async function getGuideForAudioResource(
  publication: Publication,
  audioResource: string,
): Promise<GuidedNavigationDocument | null> {
  const correspondingMediaOverlayResourceIndex =
    publication.resources?.items.findIndex(
      (item) => item.href === audioResource,
    )
  if (
    correspondingMediaOverlayResourceIndex === -1 ||
    !correspondingMediaOverlayResourceIndex
  )
    return null

  const correspondingMediaOverlayResource =
    publication.resources?.items[correspondingMediaOverlayResourceIndex + 1]
  if (!correspondingMediaOverlayResource) {
    console.warn("No corresponding media overlay resource found")
    return null
  }

  // the guided navigation document is named the same as the corresponding media overlay resource, but with .smil rather than .html
  if (!correspondingMediaOverlayResource.href.endsWith(".smil")) return null

  // read the resource
  const smil = await publication
    .get(correspondingMediaOverlayResource)
    .readAsString()
  // read the xml and find the first element like this     <seq id="body019_overlay" epub:textref="../html/p2c07.html" epub:type="chapter">
  if (!smil) {
    console.warn("No SMIL XML found", correspondingMediaOverlayResource.href)
    return null
  }

  const textRef = smil.match(/epub:textref="([^"]+)"/)?.[1]

  if (!textRef) {
    console.warn(
      "No textref found in SMIL XML",
      correspondingMediaOverlayResource.href,
    )
    return null
  }

  // get rid of ../ prefix
  const cleanedUrl = textRef.replace(/^\.+\//, "")

  if (cleanedUrl === textRef) {
    console.warn("NO CLEANED URL", textRef)
    return null
  }

  const correctUrl = publication.readingOrder.items.find((item) =>
    item.href.endsWith(cleanedUrl),
  )
  if (!correctUrl) {
    console.warn("No reading order url found for", cleanedUrl)
    return null
  }

  const guide = await publication.guideForLink(correctUrl)

  return guide ?? null
}

/**
 * Get audio clip information for a text locator
 * Similar to iOS getClip method
 */
export function getClip(
  guide: GuidedNavigationDocument,
  locator: Locator,
): AudioClip | null {
  const fragments =
    locator.locations.fragments.length > 0
      ? locator.locations.fragments[0]
      : getFragments(guide, locator)[0]?.fragment
  const fragment = fragments

  if (!fragment) {
    return null
  }

  const textRef = `${locator.href}#${fragment}`
  let node = findNodeFromTextRef(textRef, guide.guided ?? [])

  if (!node?.clip) {
    // try again with the getFragments method
    const fragmentsAgain = getFragments(guide, locator)[0]?.fragment

    if (!fragmentsAgain) {
      // the big guns

      // assuming guide is correct

      return null
    }

    const textRefAgain = `${locator.href}#${fragmentsAgain}`
    node = findNodeFromTextRef(textRefAgain, guide.guided ?? [])
    if (!node?.clip) {
      return null
    }
  }

  return {
    audioResource: node.clip.audioResource,
    fragmentId: node.fragmentId,
    start: node.clip.start ?? 0,
    end: node.clip.end ?? 0,
    duration: node.clip.end ?? 0 - (node.clip.start ?? 0),
  }
}

/**
 * Get all text fragments for a specific chapter/href
 * Similar to iOS getFragments method
 */
export function getFragments(
  guide: GuidedNavigationDocument,
  locator: Locator,
): TextFragment[] {
  const allFragments = collectAllFragments(guide.guided ?? [])
  return allFragments.filter((fragment) => fragment.href === locator.href)
}

/**
 * Get the fragment before the current locator
 * Similar to iOS getFragment(before:) method
 */
export async function getFragmentBefore(
  guide: GuidedNavigationDocument,
  locator: Locator,
): Promise<TextFragment | null> {
  const currentFragment = locator.locations.fragments[0]
  if (!currentFragment) {
    return null
  }

  const allFragments = collectAllFragments(guide.guided ?? [])
  const currentIndex = allFragments.findIndex(
    (fragment) =>
      fragment.href === locator.href && fragment.fragment === currentFragment,
  )

  if (currentIndex <= 0) {
    return null
  }

  const previousFragment = allFragments[currentIndex - 1]
  if (!previousFragment) {
    return null
  }

  const locatorForFragment = await getLocatorForFragment(
    previousFragment.href,
    previousFragment.fragment,
  )

  return {
    ...previousFragment,
    locator: locatorForFragment ?? null,
  }
}

/**
 * Get the fragment after the current locator
 * Similar to iOS getFragment(after:) method
 */
export async function getFragmentAfter(
  guide: GuidedNavigationDocument,
  locator: Locator,
): Promise<TextFragment | null> {
  const currentFragment = locator.locations.fragments[0]
  if (!currentFragment) {
    return null
  }

  const allFragments = collectAllFragments(guide.guided ?? [])
  const currentIndex = allFragments.findIndex(
    (fragment) =>
      fragment.href === locator.href && fragment.fragment === currentFragment,
  )

  if (currentIndex === -1 || currentIndex >= allFragments.length - 1) {
    return null
  }

  const nextFragment = allFragments[currentIndex + 1]
  if (!nextFragment) {
    return null
  }

  const locatorForFragment = await getLocatorForFragment(
    nextFragment.href,
    nextFragment.fragment,
  )

  return {
    ...nextFragment,
    locator: locatorForFragment ?? null,
  }
}

/**
 * Get fragment from audio clip URL and position
 * Similar to iOS getFragment(clipUrl:position:) method
 */
export async function getFragmentForClip(
  guide: GuidedNavigationDocument,
  clipUrl: string,
  position: number,
): Promise<TextFragment | null> {
  const relativeClipUrl = clipUrl.replace(/.*\/read\/(.*)$/, "$1")
  const node = findNodeFromClip(relativeClipUrl, position, guide.guided ?? [])

  if (!node?.textref) {
    console.warn("NO TEXTREF", node, {
      clipUrl,
      position,
    })
    return null
  }

  const [href, fragment] = node.textref.split("#")
  if (!href || !fragment) {
    console.warn("NO HREF OR FRAGMENT", node)
    return null
  }

  const locator = await getLocatorForFragment(href, fragment)

  return {
    href,
    fragment,
    locator: locator ?? null,
  }
}

/**
 * Create a locator for a specific href and fragment
 * Similar to iOS getLocatorFor method
 */
export async function getLocatorForFragment(
  href: string,
  fragment: string,
): Promise<Locator | null> {
  const publication = getPublication()
  let positions = getPositions()
  const resource = getResource()

  if (!publication) {
    return null
  }

  const link = publication.linkWithHref(href)
  if (!link) {
    return null
  }

  try {
    const pubResource = publication.get(link)

    // we want to read the actual html of the document
    let htmlContent = resource
    if (!htmlContent || !htmlContent.content || htmlContent.href !== href) {
      htmlContent = {
        href,
        content: (await pubResource.readAsString()) ?? null,
      }
      registerResource(htmlContent)
    }

    if (!htmlContent.content) {
      console.error("NO HTML CONTENT", href)
      return new Locator({
        href,
        type: "application/xhtml+xml",
      })
    }

    // can likely be faster by using an actual DOM parser
    const fragmentRegex = new RegExp(`id="${fragment}"`)
    const match = htmlContent.content.match(fragmentRegex)

    if (!match?.index) {
      console.error("NO MATCH", fragment, htmlContent)
      return new Locator({
        href,
        type: "application/xhtml+xml",
      })
    }

    const progression = match.index / htmlContent.content.length
    if (!positions) {
      positions = await publication.positionsFromManifest()
      // TODO: update position
      registerPositions(positions)
      // positionsRef.current = positions
    }
    const chapterReadingOrderIndex = publication.readingOrder.findIndexWithHref(
      link.href,
    )

    if (chapterReadingOrderIndex === -1) {
      console.error("NO CHAPTER INDEX OR POSITIONS", href, positions)
      return new Locator({
        href,
        type: "application/xhtml+xml",
      })
    }

    const chapterPositionIndex = positions.findIndex(
      (position) =>
        position.href ===
        publication.readingOrder.items[chapterReadingOrderIndex]?.href,
    )
    if (chapterPositionIndex === -1) {
      console.error("NO CHAPTER POSITION", chapterPositionIndex, positions)
      return new Locator({
        href,
        type: "application/xhtml+xml",
      })
    }

    const chapterPosition = positions[chapterPositionIndex]

    const startOfChapterProgression =
      chapterPosition?.locations.totalProgression

    if (!startOfChapterProgression) {
      console.error(
        "NO START OF CHAPTER PROGRESSION",
        chapterPosition,
        positions,
      )
      return new Locator({
        href,
        type: "application/xhtml+xml",
      })
    }

    const nextChapterReadingOrderIndex = chapterReadingOrderIndex + 1
    const startOfNextChapterProgression =
      nextChapterReadingOrderIndex >= publication.readingOrder.items.length
        ? 1
        : positions[chapterPositionIndex + 1]?.locations.totalProgression ?? 1

    const totalProgression =
      startOfChapterProgression +
      progression * (startOfNextChapterProgression - startOfChapterProgression)

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion

    const locator = {
      href,
      type: "application/xhtml+xml",
      locations: new LocatorLocations({
        fragments: [fragment],
        progression,
        totalProgression,
      }),
    } as Locator

    const locatorWithPosition = getLocatorWithClosestPosition(
      locator,
      positions,
    )
    return locatorWithPosition
  } catch (error) {
    console.error("Error creating locator:", error)
    return new Locator({
      href,
      type: "application/xhtml+xml",
    })
  }
}

/**
 * Find node from text reference
 */
function findNodeFromTextRef(
  textRef: string,
  nodes: GuidedNavigationObject[],
): GuidedNavigationObject | null {
  for (const node of nodes) {
    if (node.role?.has("section") || node.role?.has("chapter")) {
      const found = findNodeFromTextRef(textRef, node.children ?? [])
      if (found !== null) {
        return found
      }
    }

    if (node.textref === textRef) {
      return node
    }
  }
  return null
}

/**
 * Find node from audio clip URL and position
 */
function findNodeFromClip(
  clipUrl: string,
  position: number,
  nodes: GuidedNavigationObject[],
): GuidedNavigationObject | null {
  for (const node of nodes) {
    if (node.role?.has("section") || node.role?.has("chapter")) {
      const found = findNodeFromClip(clipUrl, position, node.children ?? [])
      if (found !== null) {
        return found
      }
    }

    const clip = node.clip
    const start = clip?.start
    const end = clip?.end

    if (
      start !== undefined &&
      end !== undefined &&
      clip?.audioResource === clipUrl &&
      start <= position &&
      end > position
    ) {
      return node
    }
  }
  return null
}

/**
 * Collect all text fragments from guided navigation
 */
export function collectAllFragments(
  nodes: GuidedNavigationObject[],
): TextFragment[] {
  const fragments: TextFragment[] = []

  for (const node of nodes) {
    if (node.role?.has("section") || node.role?.has("chapter")) {
      fragments.push(...collectAllFragments(node.children ?? []))
    } else if (node.textref) {
      const [href, fragment] = node.textref.split("#")
      if (href && fragment) {
        fragments.push({ href, fragment })
      }
    }
  }

  return fragments
}

/**
 * Hook to get fragment navigation (previous/next)
 */
export function getFragmentNavigation(
  currentLocator: Locator | null,
  guide: GuidedNavigationDocument,
) {
  const fragments = collectAllFragments(guide.guided ?? [])

  if (!currentLocator || fragments.length === 0) {
    return { previousFragment: null, nextFragment: null, currentIndex: -1 }
  }

  const currentFragment = currentLocator.locations.fragments[0]
  if (!currentFragment) {
    return { previousFragment: null, nextFragment: null, currentIndex: -1 }
  }

  const currentIndex = fragments.findIndex(
    (fragment) => fragment.fragment === currentFragment,
  )

  if (currentIndex === -1) {
    return { previousFragment: null, nextFragment: null, currentIndex: -1 }
  }

  const previousFragment = currentIndex > 0 ? fragments[currentIndex - 1] : null
  const nextFragment =
    currentIndex < fragments.length - 1 ? fragments[currentIndex + 1] : null

  return { previousFragment, nextFragment, currentIndex }
}

export function guideHrefToRef(href: string) {
  const [, ref] = href.split("=")

  if (!ref) return null

  return decodeURIComponent(ref)
}

export function getNextRefsFromGuide(guide: GuidedNavigationDocument) {
  const [prev, next] = guide.links?.items ?? []

  return {
    previous: guideHrefToRef(prev?.href ?? ""),
    next: guideHrefToRef(next?.href ?? ""),
  }
}

/**
 * utility function for finding closest position - keeping this here for now
 * if you don't provide a href we look through the entire position array
 */
export function findClosestPosition(
  locator: Locator | null,
  positions: Locator[],
) {
  if (!locator) return null

  if (locator.locations.position) {
    return locator
  }

  if (!locator.locations.progression && !locator.locations.totalProgression) {
    // get the first position with the same href
    const firstPosition = positions.find(
      (position) => position.href === locator.href,
    )
    if (firstPosition) {
      return firstPosition
    }

    return null
  }

  const positionsMatchingHref = positions.filter(
    (position) => position.href === locator.href,
  )

  const position = positionsMatchingHref.find((position, idx) => {
    if (position.locations.progression == locator.locations.progression) {
      return true
    }

    if (
      position.locations.progression == null ||
      locator.locations.progression == null
    ) {
      return false
    }

    const isSmallerEqualToLocator =
      position.locations.progression <= locator.locations.progression
    const nextIsGreaterThanLocatorOrDoesNotExist =
      !positionsMatchingHref[idx + 1]?.locations.progression ||
      (positionsMatchingHref[idx + 1]?.locations.progression ?? 0) >=
        locator.locations.progression

    if (isSmallerEqualToLocator && nextIsGreaterThanLocatorOrDoesNotExist) {
      return true
    }

    return false
  })
  if (!position) {
    console.warn("NO POSITION FOUND", locator, positions)
    return null
  }

  return position
}

/**
 * mostly used for looking up fragment locators
 */
export async function getLocatorWithClosestPositionAsync<
  T extends Locator | null,
>(locator: T, positions: Locator[]): Promise<T> {
  if (!locator) return locator

  // if locator has a fragment but no progression, calculate it
  const fragment = locator.locations.fragments[0]
  const hasNoProgression =
    !locator.locations.progression && !locator.locations.totalProgression

  if (fragment && hasNoProgression) {
    const baseHref = locator.href.split("#")[0] ?? locator.href
    const calculatedLocator = await getLocatorForFragment(baseHref, fragment)

    if (calculatedLocator) {
      return calculatedLocator as T
    }
  }

  // fall back to synchronous version
  return getLocatorWithClosestPosition(locator, positions)
}

export function getLocatorWithClosestPosition<T extends Locator | null>(
  locator: T,
  positions: Locator[],
): T {
  if (!locator) return locator

  const closestPosition = findClosestPosition(locator, positions)

  if (!closestPosition) return locator

  const newProgression =
    (closestPosition.locations.progression ?? 0) >
    (locator.locations.progression ?? 0)
      ? closestPosition.locations.progression
      : locator.locations.progression
  const newTotalProgression =
    (closestPosition.locations.totalProgression ?? 0) >
    (locator.locations.totalProgression ?? 0)
      ? closestPosition.locations.totalProgression
      : locator.locations.totalProgression

  return new Locator({
    href: locator.href,
    type: locator.type,
    locations: new LocatorLocations({
      fragments: locator.locations.fragments,
      position: closestPosition.locations.position ?? 0,
      progression: newProgression ?? 0,
      totalProgression: newTotalProgression ?? 0,
    }),
  }) as T
}

/**
 * DFS traversal of toc
 */
export function traverseToc(
  toc: Link[],
  cb: (item: Link, level: number) => void,
): void {
  const traverse = (items: Link[], level: number) => {
    for (const item of items) {
      cb(item, level)
      if (item.children) {
        traverse(item.children.items, level + 1)
      }
    }
  }

  traverse(toc, 0)
}

/**
 * Get a ToC item's locator with accurate progression.
 */
export async function getTocItemLocatorWithProgression(
  tocItem: TocItem,
): Promise<Locator | null> {
  const fragment = tocItem.href.split("#")[1]

  if (!fragment) {
    return tocItem.locator
  }

  const baseHref = tocItem.href.split("#")[0] ?? tocItem.href
  return await getLocatorForFragment(baseHref, fragment)
}

export const getTocItemsWithLocator = (
  publication: Publication,
  positions: Locator[] | null,
) => {
  if (!positions) {
    return []
  }

  const items: Array<TocItem> = []

  traverseToc(publication.toc?.items || [], (item, level) => {
    const locator = publication.manifest.locatorFromLink(item)
    const locatorWithPosition = getLocatorWithClosestPosition(
      locator ?? null,
      positions,
    )

    items.push({
      id: item.href,
      title: item.title,
      href: item.href,
      level: level,
      locator: locatorWithPosition,
    })
  })

  return items
}

export async function getPositionsForTocItem(
  tocItem: TocItem,
  tocItems: TocItem[],
  positions: Locator[],
  publication: Publication,
): Promise<Locator[]> {
  if (!tocItem.locator) return []

  const baseHref = tocItem.href.split("#")[0] ?? tocItem.href
  const fragment = tocItem.href.split("#")[1]

  if (!fragment) {
    const readingOrder = publication.readingOrder.items
    const currentTocIndex = tocItems.findIndex((item) => item.id === tocItem.id)

    if (currentTocIndex === -1) {
      return positions.filter((p) => p.href === baseHref)
    }

    const currentReadingOrderIndex = readingOrder.findIndex(
      (item) => item.href === baseHref,
    )

    if (currentReadingOrderIndex === -1) {
      return positions.filter((p) => p.href === baseHref)
    }

    let nextReadingOrderIndex = readingOrder.length
    for (let i = currentTocIndex + 1; i < tocItems.length; i++) {
      const nextTocItem = tocItems[i]
      if (!nextTocItem) continue

      const nextTocBaseHref = nextTocItem.href.split("#")[0]
      const nextIdx = readingOrder.findIndex(
        (item) => item.href === nextTocBaseHref,
      )

      if (nextIdx > currentReadingOrderIndex) {
        nextReadingOrderIndex = nextIdx
        break
      }
    }

    const relevantHrefs = readingOrder
      .slice(currentReadingOrderIndex, nextReadingOrderIndex)
      .map((item) => item.href)

    return positions.filter((p) => relevantHrefs.includes(p.href))
  }

  const currentLocator = await getTocItemLocatorWithProgression(tocItem)
  if (!currentLocator) return []

  const tocItemProgression = currentLocator.locations.progression ?? 0
  const currentTocIndex = tocItems.findIndex((item) => item.id === tocItem.id)

  let nextTocItemProgression: number | null = null
  for (let i = currentTocIndex + 1; i < tocItems.length; i++) {
    const nextItem = tocItems[i]
    if (!nextItem) continue

    const nextBaseHref = nextItem.href.split("#")[0]
    if (nextBaseHref === baseHref) {
      const nextLocator = await getTocItemLocatorWithProgression(nextItem)
      if (nextLocator) {
        nextTocItemProgression = nextLocator.locations.progression ?? null
        break
      }
    }
  }

  return positions.filter((p) => {
    if (p.href !== baseHref) return false

    const posProgression = p.locations.progression ?? 0

    if (nextTocItemProgression !== null) {
      return (
        posProgression >= tocItemProgression &&
        posProgression < nextTocItemProgression
      )
    }

    return posProgression >= tocItemProgression
  })
}

export const getAudiobookLocator = (
  position: number,
  currentTrackIndex: number,
  playlist: { duration?: number; type: string; url: string }[],
) => {
  const totalDuration = playlist.reduce(
    (acc, track) => acc + (track.duration ?? 0),
    0,
  )

  const totalPosition =
    playlist
      .slice(0, currentTrackIndex)
      .reduce((acc, track) => acc + (track.duration ?? 0), 0) + position

  const currentTrack = playlist[currentTrackIndex]

  if (!currentTrack) {
    return null
  }
  const totalProgression =
    totalPosition > totalDuration ? 1 : totalPosition / totalDuration
  const progression = !currentTrack.duration
    ? 0
    : position / currentTrack.duration

  return new Locator({
    href: getResourceHrefFromApiUrl(currentTrack.url),
    type: currentTrack.type,
    locations: new LocatorLocations({
      fragments: [`t=${position}`],
      progression,
      totalProgression,
    }),
  })
}

/**
 * best effort to translate a locator from one audio/text mode to another
 * likely not very accurate, but it's better than nothing
 */
export function translateLocator(locator: Locator, mode: ReadingMode) {
  const locatorType = locator.type.includes("audio") ? "audio" : "text"
  const publication = getPublication()
  if (!publication) return locator

  const noTranslationNecessary =
    (mode === "audiobook" && locatorType === "audio") ||
    (mode !== "audiobook" && locatorType === "text")

  if (noTranslationNecessary) {
    return locator
  }

  // textLocator => audiobookLocator
  if (mode === "audiobook") {
    if (!locator.locations.totalProgression) return locator

    let runningTotal = 0
    const tracks = publication.readingOrder.items
      .filter((item) => item.type?.includes("audio"))
      .map((item) => ({
        duration: item.duration ?? 0,
        type: item.type ?? "",
        url: item.href,
      }))

    const totalDuration = tracks.reduce((acc, track) => acc + track.duration, 0)

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i]
      if (!track) continue
      runningTotal += track.duration

      if (runningTotal > locator.locations.totalProgression * totalDuration) {
        const position = (locator.locations.progression ?? 0) * track.duration
        return getAudiobookLocator(position, i, tracks) ?? locator
      }
      // give up, go to start, do not collect $200
    }
    return getAudiobookLocator(0, 0, tracks) ?? locator
  }

  const positions = getPositions()
  if (!positions) return locator

  const firstPosition = positions.find(
    (position) =>
      (position.locations.totalProgression ?? 0) >=
      (locator.locations.totalProgression ?? 0),
  )
  if (!firstPosition) return locator

  // ensure the position is within bounds
  const lastPosition = positions[positions.length - 1]
  if (
    lastPosition &&
    firstPosition.locations.position &&
    firstPosition.locations.position > (lastPosition.locations.position ?? 0)
  ) {
    return lastPosition
  }

  return firstPosition
}
