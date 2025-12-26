import { Platform } from "react-native"

import { type BookWithRelations } from "@/database/books"
import { type BookAuthor } from "@/legacy/persistence/books"
import { type UUID } from "@/uuid"

import {
  type EPUBViewProps,
  type EPUBViewRef,
  type ReadiumClip,
  type ReadiumContributor,
  type ReadiumLink,
  type ReadiumLocalizedString,
  type ReadiumLocator,
  type ReadiumManifest,
  type ReadiumTextFragment,
} from "./src/Readium.types"
import ReadiumModule from "./src/ReadiumModule"
export { default as ReadiumView } from "./src/ReadiumView"
import EPUBView from "./src/ReadiumView"

export async function extractArchive(archiveUrl: string, extractedUrl: string) {
  await ReadiumModule.extractArchive(archiveUrl, extractedUrl)
}

export async function openPublication(
  bookUuid: UUID,
  expandedBookUri: string,
): Promise<ReadiumManifest> {
  const manifest = await ReadiumModule.openPublication(
    bookUuid,
    expandedBookUri,
  )
  return Platform.OS === "android" ? manifest : JSON.parse(manifest)
}

export async function buildAudiobookManifest(
  bookUuid: UUID,
): Promise<ReadiumManifest> {
  return await ReadiumModule.buildAudiobookManifest(bookUuid)
}

const linkLocatorCache = new Map<UUID, Map<string, ReadiumLocator>>()

export async function locateLink(
  bookUuid: UUID,
  link: ReadiumLink,
): Promise<ReadiumLocator> {
  const cached = linkLocatorCache.get(bookUuid)?.get(link.href)
  if (cached) return cached
  const locator = await ReadiumModule.locateLink(bookUuid, link)
  if (!linkLocatorCache.has(bookUuid)) linkLocatorCache.set(bookUuid, new Map())
  linkLocatorCache.get(bookUuid)!.set(link.href, locator)
  return locator
}

export async function getPositions(bookUuid: UUID): Promise<ReadiumLocator[]> {
  const positions = await ReadiumModule.getPositions(bookUuid)
  return positions
}

export async function getResource(
  bookUuid: UUID,
  link: ReadiumLink,
): Promise<string> {
  const resource = await ReadiumModule.getResource(bookUuid, link)
  return resource
}

function getAudiobookClip(book: BookWithRelations, locator: ReadiumLocator) {
  const audiobook = book.audiobook
  if (!audiobook) return null

  const timeFragment = locator.locations?.fragments
    ?.find((f) => f.startsWith("t="))
    ?.replace("t=", "")
  if (timeFragment !== undefined) {
    return {
      relativeUrl: locator.href,
      start: parseFloat(timeFragment),
    }
  }

  const progression = locator.locations?.progression
  if (progression !== undefined) {
    const manifest = audiobook.manifest
    if (!manifest) return null

    const duration = manifest.readingOrder.find(
      (resource) => resource.href === locator.href,
    )?.duration
    if (duration === undefined) return null

    return {
      relativeUrl: locator.href,
      start: progression * duration,
    }
  }

  const totalProgression = locator.locations?.totalProgression
  if (totalProgression === undefined) return null

  const manifest = audiobook.manifest
  if (!manifest) return null

  let totalDuration = 0
  for (const resource of manifest.readingOrder) {
    totalDuration += resource.duration ?? 0
  }
  const totalStart = totalDuration * totalProgression

  let count = 0
  for (const resource of manifest.readingOrder) {
    if (count + (resource.duration ?? 0) >= totalStart) {
      return {
        relativeUrl: resource.href,
        start: totalStart - count,
      }
    }
    count += resource.duration ?? 0
  }

  return null
}

export async function getClip(
  book: BookWithRelations,
  format: "audiobook" | "ebook" | "readaloud",
  locator: ReadiumLocator,
): Promise<{ relativeUrl: string; start: number } | null> {
  if (format === "audiobook") {
    return getAudiobookClip(book, locator)
  }

  const clip = (await ReadiumModule.getClip(book.uuid, locator)) as ReadiumClip
  return clip
}

export async function getFragment(
  bookUuid: UUID,
  clipUrl: string,
  position: number,
): Promise<ReadiumTextFragment | null> {
  const fragment = await ReadiumModule.getFragment(bookUuid, clipUrl, position)
  return fragment
}

export async function getNextFragment(
  bookUuid: UUID,
  locator: ReadiumLocator,
): Promise<ReadiumTextFragment | null> {
  return ReadiumModule.getNextFragment(bookUuid, locator)
}

export async function getPreviousFragment(
  bookUuid: UUID,
  locator: ReadiumLocator,
): Promise<ReadiumTextFragment | null> {
  return ReadiumModule.getPreviousFragment(bookUuid, locator)
}

export function areLocatorsEqual(a: ReadiumLocator, b: ReadiumLocator) {
  if (a.href !== b.href) return false
  if (a.locations?.progression !== b.locations?.progression) return false
  if ((a.text || b.text) && a.text?.highlight !== b.text?.highlight)
    return false

  return true
}

export function parseLocalizedString(
  localizedString: ReadiumLocalizedString | null | undefined,
  locale = "en-US",
): string {
  if (typeof localizedString === "string") {
    return localizedString
  }

  if (!localizedString) {
    return ""
  }

  if (locale in localizedString) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return localizedString[locale]!
  }

  const firstLocale =
    // Localized strings all have at least one locale
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    Object.keys(localizedString)[0]!

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return localizedString[firstLocale]!
}

export function readiumToStorytellerAuthors(
  author: ReadiumContributor[] | ReadiumContributor | undefined,
) {
  if (!author) return []

  const authors = Array.isArray(author) ? author : [author]

  return authors.map<BookAuthor>((a) => {
    if (typeof a === "string") {
      return {
        name: parseLocalizedString(a),
        file_as: a,
        role: null,
      }
    }
    return {
      name: parseLocalizedString(a.name),
      file_as: a.sortAs ?? parseLocalizedString(a.name),
      role: Array.isArray(a.role) ? a.role.join(", ") : a.role ?? null,
    }
  })
}

export type { EPUBViewProps, EPUBViewRef, ReadiumManifest }
export { EPUBView }
