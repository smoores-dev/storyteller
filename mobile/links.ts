import { type ReadiumManifest } from "./modules/readium/src/Readium.types"

export function extractPath(href: string) {
  const url = new URL(href, "http://storyteller.local")
  return url.pathname
}

export function isSameChapter(href1: string, href2: string) {
  return extractPath(href1) === extractPath(href2)
}

export function getHrefChapterTitle(
  href: string,
  toc: NonNullable<ReadiumManifest["toc"]>,
) {
  for (const link of toc) {
    if (isSameChapter(link.href, href)) {
      return link.title ?? null
    }
    if (!link.children) continue
    for (const childLink of link.children) {
      if (isSameChapter(childLink.href, href)) {
        return childLink.title ?? null
      }
    }
  }
  return null
}

// Roughly the number of "positions" that fit in a
// standard paperback book page
export const PAPERBACK_PAGE_SCALE = 3

export function positionToPageCount(position: number) {
  return Math.ceil(position / PAPERBACK_PAGE_SCALE)
}
