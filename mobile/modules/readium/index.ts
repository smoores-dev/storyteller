// Import the native module. On web, it will be resolved to Readium.web.ts
// and on native platforms to Readium.ts
import ReadiumModule from "./src/ReadiumModule"
export { default as ReadiumView } from "./src/ReadiumView"
import {
  EPUBViewProps,
  EPUBViewRef,
  ReadiumManifest,
  ReadiumLink,
  ReadiumClip,
  ReadiumTextFragment,
  ReadiumLocator,
} from "./src/Readium.types"
import EPUBView from "./src/ReadiumView"

export async function extractArchive(archiveUrl: string, extractedUrl: string) {
  await ReadiumModule.extractArchive(archiveUrl, extractedUrl)
}

export async function openPublication(
  bookId: number,
  expandedBookUri: string,
): Promise<ReadiumManifest> {
  const publicationJson = await ReadiumModule.openPublication(
    bookId,
    expandedBookUri,
  )
  const publication = JSON.parse(publicationJson)
  return publication
}

export async function locateLink(
  bookId: number,
  link: ReadiumLink,
): Promise<ReadiumLocator> {
  const locator = await ReadiumModule.locateLink(bookId, link)
  return locator
}

export async function getPositions(bookId: number): Promise<ReadiumLocator[]> {
  const positions = await ReadiumModule.getPositions(bookId)
  return positions
}

export async function getResource(
  bookId: number,
  link: ReadiumLink,
): Promise<string> {
  const resource = await ReadiumModule.getResource(bookId, link)
  return resource
}

export async function getClip(
  bookId: number,
  locator: ReadiumLocator,
): Promise<ReadiumClip> {
  const clip = await ReadiumModule.getClip(bookId, locator)
  return clip
}

export async function getFragment(
  bookId: number,
  clipUrl: string,
  position: number,
): Promise<ReadiumTextFragment | null> {
  const fragment = await ReadiumModule.getFragment(bookId, clipUrl, position)
  return fragment
}

export function areLocatorsEqual(a: ReadiumLocator, b: ReadiumLocator) {
  if (a.href !== b.href) return false
  if (a.locations?.progression !== b.locations?.progression) return false
  if ((a.text || b.text) && a.text?.highlight !== b.text?.highlight)
    return false

  return true
}

export type { EPUBViewProps, EPUBViewRef, ReadiumManifest }
export { EPUBView }
