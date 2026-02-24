import { type FrameComms, type FrameManager } from "@readium/navigator"
import { type DecoratorRequest } from "@readium/navigator-html-injectables"
import { Link, type Locator, type Publication } from "@readium/shared"

import {
  type AudioClip,
  type TocItem,
  getClip,
  getFragmentNavigation,
  getLocatorForFragment,
  getResourceHrefFromApiUrl,
} from "@/components/reader/BookService"
import { withActiveFrame } from "@/components/reader/frameUtils"
import { AudioPlayer } from "@/services/AudioPlayerService"
import {
  getAudioToTextMap,
  getGuide,
  getPublication,
  getResource,
  getTextToAudioMap,
  getTocItems,
  registerGuide,
  registerResource,
} from "@/store/readerRegistry"

export function findSegmentForTime(
  segments: Array<{ startTime: number; endTime: number; textHref: string }>,
  currentTime: number,
) {
  // binary search for efficiency with large segment arrays
  let left = 0
  let right = segments.length - 1

  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    const segment = segments[mid]

    if (!segment) break

    if (currentTime >= segment.startTime && currentTime <= segment.endTime) {
      return segment
    }

    if (currentTime < segment.startTime) {
      right = mid - 1
    } else {
      left = mid + 1
    }
  }

  // if no exact match, return the closest segment
  const firstSegment = segments[0]
  if (!firstSegment) return undefined

  return segments.reduce((closest, seg) => {
    const closestDist = Math.min(
      Math.abs(currentTime - closest.startTime),
      Math.abs(currentTime - closest.endTime),
    )
    const segDist = Math.min(
      Math.abs(currentTime - seg.startTime),
      Math.abs(currentTime - seg.endTime),
    )
    return segDist < closestDist ? seg : closest
  }, firstSegment)
}

export async function getGuideForTrack(
  publication: Publication,
  audioResource: string,
  currentTime: number,
) {
  const audioToTextMap = getAudioToTextMap()
  if (!audioToTextMap) return

  const audioInfo = audioToTextMap.get(audioResource)
  if (!audioInfo) return
  if (audioInfo.segments.length === 0) return

  const guide = getGuide()

  const segment = findSegmentForTime(audioInfo.segments, currentTime)
  const targetTextHref = segment?.textHref

  // check if current guide is good enough
  if (
    guide &&
    guide.guided?.some((g) =>
      g.children?.some((c) => c.clip?.audioResource === audioResource),
    )
  ) {
    if (!targetTextHref) {
      return [guide]
    }

    // if we have a target text href, check if the guide matches it
    const guideMatchesTarget = guide.guided.some((g) =>
      g.children?.some(
        (c) =>
          new URL(c.textref ?? "non-existent", publication.baseURL).pathname ===
            new URL(targetTextHref, publication.baseURL).pathname &&
          // and check if the clip start is within the segment start and end
          c.clip?.start !== undefined &&
          c.clip.start >= segment.startTime &&
          c.clip.end !== undefined &&
          c.clip.end <= segment.endTime,
      ),
    )

    if (guideMatchesTarget) {
      return [guide]
    }
  }

  // determine which text href to load
  // if we have a time, use the segment for that time; otherwise use the first segment
  const textHrefToLoad = targetTextHref ?? audioInfo.segments[0]?.textHref

  if (!textHrefToLoad) return []

  try {
    const link = publication.linkWithHref(textHrefToLoad)
    if (!link) return []

    const newGuide = await publication.guideForLink(link)
    if (!newGuide) return []

    registerGuide(newGuide)
    return [newGuide]
  } catch (error) {
    console.error("Failed to get guide:", error)
    return []
  }
}

export async function getGuidesForText(
  publication: Publication,
  textHref: string,
) {
  const textToAudioMap = getTextToAudioMap()
  if (!textToAudioMap) return

  const audio = textToAudioMap.get(textHref)
  if (!audio) return
  if (audio.clips.size === 0) return

  const guide = getGuide()
  // FIXME: dangerous, not checking for #
  if (
    guide?.guided?.some((g) =>
      g.children?.some(
        (c) =>
          new URL(c.textref ?? "non-existent", publication.baseURL).pathname ===
          new URL(textHref, publication.baseURL).pathname,
      ),
    )
  ) {
    return [guide]
  }

  const newGuide = await publication.guideForLink(new Link({ href: textHref }))

  if (!newGuide) {
    return
  }

  registerGuide(newGuide)

  return [newGuide]
}

export const clearHighlight = (activeFrame: FrameManager) => {
  if (activeFrame.msg) {
    activeFrame.msg.send("decorate", {
      group: "highlight",
      action: "clear",
    })
  }
}

export const highlightFragment = (
  activeFrame: FrameManager & { msg: FrameComms },
  locator: Locator,
  clear: boolean = true,
  _source?: string,
) => {
  if (clear) {
    clearHighlight(activeFrame)
  }

  activeFrame.msg.send("decorate", {
    group: "highlight",
    action: "add",
    decoration: {
      id: "highlight",
      locator: locator,
      style: {
        tint: `var(--reader-highlight-color)`,
      },
    },
  } as DecoratorRequest)
}

export const getHrefFromActiveFrame = (frame?: FrameManager) => {
  return withActiveFrame((activeFrame) => {
    const window = activeFrame.iframe.contentWindow

    const baseElement = window.document.querySelector<HTMLBaseElement>(
      "base[data-readium=true",
    )
    if (!baseElement) return null

    const url = baseElement.href

    const href = getResourceHrefFromApiUrl(url)

    return href
  }, frame)
}

/**
 * This is necessary in a situation like the following
 * - Text file is very long
 * - ToC locator has a fragment that does not exist in a guide (eg #heading-14 when all the guides are something like #sentence-42. the sentence is then in the heading, but that's impossible to detect from the guide)
 * - there are multiple audio files for said html file (say one for each chapter in a large "part" HTML)
 */
export async function getClipForLocatorMultipleAudioForOneHtml(
  locator: Locator,
) {
  const publication = getPublication()
  if (!publication) return

  // we just start at the beginning, there's nothing to do there
  if (!locator.locations.fragments.length) return

  const textToAudioMap = getTextToAudioMap()
  if (!textToAudioMap) return

  const audio = textToAudioMap.get(locator.href)
  if (!audio) return

  const clips = Array.from(audio.clips.values())
  if (clips.length === 0) {
    console.warn("No clips found for locator", locator)
    return
  }
  const guide = await getGuidesForText(publication, locator.href)

  if (!guide || !guide[0]) return

  // if (clips.length === 1) {
  const clip = getClip(guide[0], locator)

  if (
    clip &&
    (clip.fragmentId === locator.locations.fragments[0] || clips.length === 1)
  ) {
    // if we have an exact match let it slide, or if we only have one clip
    return clip
  }

  let resource = getResource()
  if (!resource || resource.href !== locator.href) {
    resource = {
      href: locator.href,
      content:
        (await publication
          .get(new Link({ href: locator.href }))
          .readAsString()) ?? null,
    }
    registerResource(resource)
  }

  if (!resource.content) return // boo

  const fragmentRegex = new RegExp(`id="${locator.locations.fragments[0]}"`)

  // get the second part of the split, this is everything after the fragment
  const everythingAfterFragment = resource.content.split(fragmentRegex)[1]

  if (!everythingAfterFragment) return

  // now get the first id locator after that fragment (technically it would be better to iterate over all the guide clips and find the first one that has an id locator after that fragment, but that could take a LONG time. for now well just assume its an id)

  const idRegex = new RegExp(`id="([^"]+)"`, "g")

  let attempts = 0

  let result: AudioClip | null = null
  const matches = everythingAfterFragment.matchAll(idRegex)

  while (attempts < 10) {
    attempts++
    // matchall so we can `.next()` if it doesn't work out
    const id = matches.next().value?.[1]

    if (!id) {
      console.warn("No id found", everythingAfterFragment)
      break
    }

    // now check whether that id has a guide :))))
    const guideLocator = guide[0].guided?.[0]?.children?.find((c) => {
      return c.fragmentId === id
    })

    if (!guideLocator) {
      continue
    }

    if (!guideLocator.clip) {
      continue
    }

    result = {
      audioResource: guideLocator.clip.audioResource,
      fragmentId: guideLocator.fragmentId,
      start: guideLocator.clip.start ?? 0,
      end: guideLocator.clip.end ?? 0,
      duration: guideLocator.clip.end ?? 0 - (guideLocator.clip.start ?? 0),
    }
    break
    // okay we have multiple audio files for the same html file, so this is tricky
    // we will go through the html file manually, find the place where the locator starts, then find the first guide locator afterwards
  }

  if (attempts === 10 && !result) {
    console.warn("Failed to find clip for locator after 10 attempts", locator)
    return null
  }

  return result
}

export async function handleFragmentSkip(
  direction: "next" | "previous",
  currentLocator: Locator | null,
  requestTextNavigation: (locator: Locator) => void,
) {
  const guide = getGuide()

  if (!guide || !currentLocator) return

  const fragments = getFragmentNavigation(currentLocator, guide)
  if (!fragments.previousFragment || !fragments.nextFragment) return

  const fragment =
    direction === "next" ? fragments.nextFragment : fragments.previousFragment

  let locator = fragment.locator

  if (!fragment.locator) {
    locator = await getLocatorForFragment(fragment.href, fragment.fragment)
  }

  if (!locator) {
    console.error("No locator found")
    return
  }

  requestTextNavigation(locator)
}

// navigate to next/previous reading order item (chapter)
export function handleChapterSkip(
  direction: "next" | "previous",
  currentTocItem: TocItem | null,
  requestTextNavigation: (locator: Locator) => void,
) {
  const publication = getPublication()

  if (!publication || !currentTocItem) return

  // get next toc item
  const tocItems = getTocItems()
  if (!tocItems) return

  const currentTocItemIndex = tocItems.findIndex(
    (item) => item.id === currentTocItem.id,
  )
  if (currentTocItemIndex === -1) return

  const offset = direction === "next" ? 1 : -1
  const nextTocItemIndex = currentTocItemIndex + offset

  const nextTocItem = tocItems[nextTocItemIndex]

  if (!nextTocItem || !nextTocItem.locator) return

  AudioPlayer.pause()
  requestTextNavigation(nextTocItem.locator)
}
