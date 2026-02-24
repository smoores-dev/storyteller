import {
  type EpubNavigator,
  type VisualNavigatorViewport,
} from "@readium/navigator"
import {
  type GuidedNavigationDocument,
  Locator,
  LocatorLocations,
} from "@readium/shared"

import { withActiveFrame } from "./frameUtils"

export const CSS_SELECTOR_TYPE = {
  id: "id",

  class: "class",

  tag: "tag",

  attribute: "attribute",

  nthchild: "nthchild",

  nthoftype: "nthoftype",
} as const

export interface EPUBReadingSystem {
  name: string
  version: string
  layoutStyle: "paginated" | "scrolling" // Technically, more are allowed
  hasFeature: (feature: string, version?: string) => boolean
}

export type CssSelectorType =
  (typeof CSS_SELECTOR_TYPE)[keyof typeof CSS_SELECTOR_TYPE]

export type CssSelectorTypes = CssSelectorType[]

type BlockedEventData =
  | [0, (...args: unknown[]) => unknown, unknown[], unknown[]]
  | [1, Event, EventTarget]
type CssSelectorMatchFn = (input: string) => boolean

export type CssSelectorMatch = RegExp | string | CssSelectorMatchFn

type GetCssSelector = (
  needle: Element | Element[],
  custom_options?: CssSelectorGeneratorOptionsInput,
) => string

export type CssSelectorGeneratorOptionsInput = Partial<{
  // List of selector types to use. They will be prioritised by their order.

  selectors: CssSelectorTypes

  // List of selectors that should be prioritised.

  whitelist: CssSelectorMatch[]

  // List of selectors that should be ignored.

  blacklist: CssSelectorMatch[]

  // Root element inside which the selector will be generated. If not set, the document root will be used.

  root: ParentNode | null

  // If set to `true`, the generator will test combinations of selectors of single type (e.g. multiple class selectors).

  combineWithinSelector: boolean

  // If set to `true`, the generator will try to test combinations of selectors of different types (e.g. tag + class name).

  combineBetweenSelectors: boolean

  // If set to `true`, all generated selectors will include the TAG part. Even if tag selector type is not included in `selectors` option.

  includeTag: boolean

  // Maximum number of combinations of a selector type. This is handy for performance reasons, e.g. when elements have too many classnames.

  maxCombinations: number

  // Maximum number of selector candidates to be tested for each element. This is handy for performance reasons, e.g. when elements can produce large number of combinations of various types of selectors.

  maxCandidates: number

  // Experimental. If set to `true` and the "root" option is set, the fallback selectors will use ":scope" pseudo-class to make the selectors shorter and simpler.

  useScope: boolean
}>

// This is what is injected into the HTML documents
export interface ReadiumWindow extends Window {
  _readium_blockEvents: boolean
  _readium_blockedEvents: BlockedEventData[]
  _readium_eventBlocker: EventListenerOrEventListenerObject
  _readium_cssSelectorGenerator: {
    getCssSelector: GetCssSelector
  }
  navigator: Navigator & { epubReadingSystem: EPUBReadingSystem }
}

/// Returns the `Locator` object to the first block element that is visible on
/// the screen.
export function findFirstFullyVisibleLocator(
  wnd: ReadiumWindow,
  scrolling: boolean,
  navigator: EpubNavigator,
) {
  let element = findElement(wnd, wnd.document.body, scrolling)

  let fragmentId = element.id || undefined

  // if the element doesn't have an ID, try to find the first child that has an ID
  if (!fragmentId) {
    const childWithId = findFirstChildWithId(element)
    fragmentId = childWithId?.id
    if (childWithId) {
      element = childWithId
    }
  }

  if (!fragmentId) {
    return null
  }

  const position = navigator.viewport.positions?.[0]
  const href = navigator.viewport.readingOrder[0]
  const progression = href
    ? navigator.viewport.progressions.get(href)?.start
    : 0

  return new Locator({
    href: href ?? "#",
    type: "application/xhtml+xml",
    locations: new LocatorLocations({
      fragments: [fragmentId],
      progression: progression ?? 0,
      position: position ?? 0,
      // totalProgression: totalProgression,
    }),
  })
}

function findElement(
  wnd: ReadiumWindow,
  rootElement: Element,
  scrolling: boolean,
): Element {
  for (let i = 0; i < rootElement.children.length; i++) {
    const child = rootElement.children[i]

    if (!child) {
      continue
    }

    const ignore = shouldIgnoreElement(child)
    const visible = !ignore && isElementVisible(wnd, child, scrolling)

    if (visible) {
      // if this element is fully visible, return it immediately
      if (isElementFullyVisible(wnd, child)) {
        return child
      }

      // if the element is only partially visible, search for fully visible children
      const fullyVisibleChild = findElement(wnd, child, scrolling)

      // if we found a fully visible child (not the same as the parent), return it
      if (fullyVisibleChild !== child) {
        return fullyVisibleChild
      }

      // if no fully visible child was found, continue to next sibling
    }
  }

  // if no fully visible element found among children, return the root element
  return rootElement
}

/**
 * Check if an element is fully visible in the current viewport.
 * @param wnd Window instance to operate on
 * @param element Element to check visibility of
 * @returns True if the element is fully visible, false otherwise
 */
export function isElementFullyVisible(
  wnd: ReadiumWindow,
  element: Element,
): boolean {
  const rects = element.getClientRects()
  return Array.from(rects).every((rect) => {
    const isVerticallyWithin = rect.bottom >= 0 && rect.top <= wnd.innerHeight
    const isHorizontallyWithin = rect.right >= 0 && rect.left <= wnd.innerWidth
    return isVerticallyWithin && isHorizontallyWithin
  })
}

export function isElementVisible(
  wnd: ReadiumWindow,
  element: Element,
  scrolling: boolean,
) {
  if (
    element === wnd.document.body ||
    element === wnd.document.documentElement
  ) {
    return true
  }

  const rect = element.getBoundingClientRect()
  if (scrolling) {
    return rect.bottom > 0 && rect.top < wnd.innerHeight
  } else {
    return rect.right > 0 && rect.left < wnd.innerWidth
  }
}

function shouldIgnoreElement(element: Element) {
  // we want everything with an id to be counter
  if (element.id) {
    return false
  }

  const elStyle = getComputedStyle(element)
  const display = elStyle.getPropertyValue("display")
  // Added list-item as it is a common display property for list items
  // TODO: Check if there are other display properties that should be ignored/considered
  if (display !== "block" && display != "list-item") {
    return true
  }
  // Cannot be relied upon, because web browser engine reports invisible when out of view in
  // scrolled columns!
  // const visibility = elStyle.getPropertyValue("visibility");
  // if (visibility === "hidden") {
  //     return false;
  // }
  const opacity = elStyle.getPropertyValue("opacity")
  if (opacity === "0") {
    return true
  }

  return false
}

/**
 * Find the first child element (at any depth) that has an ID
 * @param element The parent element to search within
 * @returns The first child element with an ID, or null if none found
 */
function findFirstChildWithId(element: Element): Element | null {
  // check direct children first
  for (let i = 0; i < element.children.length; i++) {
    const child = element.children[i]
    if (!child) {
      continue
    }
    if (child.id) {
      return child
    }
  }

  // if no direct children have IDs, recursively search grandchildren
  for (let i = 0; i < element.children.length; i++) {
    const child = element.children[i]
    if (!child) {
      continue
    }
    const childWithId = findFirstChildWithId(child)
    if (childWithId) {
      return childWithId
    }
  }

  return null
}

export function isLocatorWithinViewport(
  locator: Locator,
  viewport: VisualNavigatorViewport,
  scrolling = true,
) {
  if (!viewport.readingOrder.includes(locator.href)) {
    // diff chapter likely
    return false
  }

  const fragment = locator.locations.fragments[0]
  const progression = locator.locations.progression

  if (fragment) {
    let element: HTMLElement | null = null
    return withActiveFrame((activeFrame) => {
      element = activeFrame.iframe.contentDocument.getElementById(fragment)

      if (!element) {
        return false
      }

      const visible = isElementVisible(
        activeFrame.window as ReadiumWindow,
        element,
        scrolling,
      )

      return visible
    })
  }

  // don't need to check with scrolling because we will scroll to the element
  if (scrolling) {
    return true
  }

  if (!progression) {
    return false
  }

  const progressions = viewport.progressions.get(locator.href)
  if (!progressions) {
    return false
  }

  const isWithinProgressions =
    progressions.start <= progression && progressions.end >= progression

  return isWithinProgressions
}

export function isSafari(wnd: Window): boolean {
  const userAgent = wnd.navigator.userAgent
  return (
    /AppleWebKit|Safari/.test(userAgent) &&
    !/Chrome/.test(userAgent) &&
    !/Chromium/.test(userAgent)
  )
}

export function findFirstVisibleLocator(guide: GuidedNavigationDocument) {
  return withActiveFrame((activeFrame) => {
    let firstVisibleFragmentId = null
    const guideFragments = guide.guided?.[0]?.children
      ?.map((child) => child.fragmentId)
      .filter((fragment) => fragment != null)

    if (!guideFragments) return null

    const window = activeFrame.iframe.contentWindow

    for (const fragmentId of guideFragments) {
      const element = window.document.getElementById(fragmentId)
      if (!element) continue

      if (isElementFullyVisible(window as ReadiumWindow, element)) {
        firstVisibleFragmentId = fragmentId
        break
      }
    }

    if (firstVisibleFragmentId === null) return null

    return {
      href: "#",
      type: "application/xhtml+xml",
      locations: {
        cssSelector: `#${firstVisibleFragmentId}`,
        fragments: [firstVisibleFragmentId],
      },
      text: {
        highlight: window.document.getElementById(firstVisibleFragmentId)
          ?.textContent,
      },
    }
  })
}

/**
 * different method for safari because it provides vey strange results for .getClientRects
 *
 * note: turns out this is not necessary after setting `deprecatedFontSize`, but im keeping it here for a theoretically more robust implementation
 */
export async function findFirstVisibleFragmentForSafari(
  window: Window,
  guideFragments: string[],
) {
  let firstVisibleFragment: Element | null = null

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.intersectionRatio === 1.0) {
          firstVisibleFragment = entry.target
          break
        }
      }
    },
    {
      root: null,
      threshold: 1.0,
    },
  )

  for (const fragmentId of guideFragments) {
    const element = window.document.getElementById(fragmentId)
    if (!element) continue
    observer.observe(element)
  }

  // something something microtask queue
  await new Promise((resolve) => setTimeout(resolve, 10))

  observer.disconnect()

  observer.disconnect()

  return firstVisibleFragment as Element | null
}

// easing function for smooth deceleration
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

let currentScrollAnimation: number | null = null
let currentScrollWindow: Window | null = null

export function scrollToLocator(
  locator: Locator,
  scrollSettings: {
    behavior: "smooth" | "instant"
    implementation: "native" | "custom"
    speed: number
  },
) {
  return withActiveFrame((activeFrame) => {
    const document = activeFrame.iframe.contentDocument

    const fragment = locator.locations.fragments[0]
    if (!fragment) return

    const window = activeFrame.iframe.contentWindow

    const element = window.document.getElementById(fragment)
    if (!element) return

    if (scrollSettings.behavior === "instant") {
      element.scrollIntoView({
        behavior: "instant",
        block: "center",
        inline: "center",
      })
      return
    }

    if (scrollSettings.implementation === "native") {
      element.scrollIntoView({ behavior: "smooth", block: "center" })
      return
    }

    // cancel any existing scroll animation
    if (currentScrollAnimation !== null && currentScrollWindow) {
      currentScrollWindow.cancelAnimationFrame(currentScrollAnimation)
      currentScrollAnimation = null
      currentScrollWindow = null
    }

    const startY = window.scrollY
    currentScrollWindow = window

    const calculateTarget = () => {
      const rect = element.getBoundingClientRect()
      const target =
        window.scrollY + rect.top - window.innerHeight / 2 + rect.height / 2
      const maxScroll =
        document.documentElement.scrollHeight - window.innerHeight
      return Math.max(0, Math.min(target, maxScroll))
    }

    const targetY = calculateTarget()
    const distance = Math.abs(targetY - startY)

    // if already close enough, just jump there instantly
    // if (distance < 10) {
    //   window.scrollTo(0, targetY)
    //   return
    // }

    const minDuration = 400
    const maxDuration = 1200
    const distanceThreshold = 2000 // distance at which we reach max duration
    const duration =
      Math.min(
        maxDuration,
        minDuration +
          (distance / distanceThreshold) * (maxDuration - minDuration),
      ) / scrollSettings.speed

    const startTime = window.performance.now()

    const animate = (currentTime: number) => {
      // verify element still exists and animation wasn't cancelled
      const currentElement = window.document.getElementById(fragment)
      if (!currentElement || currentScrollAnimation === null) {
        currentScrollAnimation = null
        currentScrollWindow = null
        return
      }

      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)

      const easedProgress = easeOutCubic(progress)
      const currentY = startY + (targetY - startY) * easedProgress

      window.scrollTo({ top: currentY })

      if (progress < 1) {
        currentScrollAnimation = window.requestAnimationFrame(animate)
      } else {
        currentScrollAnimation = null
        currentScrollWindow = null
      }
    }

    currentScrollAnimation = window.requestAnimationFrame(animate)
  })
}
