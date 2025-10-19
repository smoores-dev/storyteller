import { type Locator } from "@readium/shared"

export function extractPath(href: string) {
  const url = new URL(href, "http://storyteller.local")
  return url.pathname
}

export function isSameChapter(href1: string, href2: string) {
  return extractPath(href1) === extractPath(href2)
}

export function isSameLocator(locator1: Locator, locator2: Locator) {
  return (
    locator1.href === locator2.href &&
    locator1.locations.position === locator2.locations.position &&
    locator1.locations.progression === locator2.locations.progression &&
    locator1.locations.totalProgression ===
      locator2.locations.totalProgression &&
    locator1.locations.fragments[0] === locator2.locations.fragments[0]
  )
}
