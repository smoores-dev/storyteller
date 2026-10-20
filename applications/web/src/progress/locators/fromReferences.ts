import assert from "node:assert"

import { Audiobook } from "@storyteller-platform/audiobook"
import { Epub, MemoryAdapter } from "@storyteller-platform/epub"

import { getAudiobookTracks } from "@/assets/audiobooks.ts"
import { type BookWithRelations } from "@/database/books.ts"
import { type ReadiumLocator } from "@/database/positions.ts"
import { characterCountToAnchorRef } from "@/progress/characterCounts/toAnchor.ts"
import { locatorFromCharacterCount } from "@/progress/locators/fromChar.ts"
import { locatorFromTime } from "@/progress/locators/fromTime.ts"
import { getOverlayIndex } from "@/progress/mediaOverlays.ts"
import { isOverlayAnchor } from "@/progress/overlayIndex.ts"
import { getAvailableAsset } from "@/progress/references.ts"
import { type UriReference } from "@/progress/uriReference.ts"

export async function locatorFromReferences(
  book: BookWithRelations,
  references: Partial<
    Record<"ebook" | "readaloud" | "audiobook", UriReference[]>
  >,
): Promise<ReadiumLocator | null> {
  const readaloud = getAvailableAsset(book, "readaloud")
  const ebook = getAvailableAsset(book, "ebook")

  const epubFilepath = readaloud?.filepath ?? ebook?.filepath
  if (!epubFilepath) {
    const audiobookAsset = getAvailableAsset(book, "audiobook")
    if (!audiobookAsset) return null

    const mediaRef = references.audiobook?.find(
      (ref) => ref.fragmentKind === "media",
    )
    if (!mediaRef) return null

    assert(mediaRef.fragment.identifier?.kind === "media")
    assert(mediaRef.fragment.identifier.media.temporal)

    const time = mediaRef.fragment.identifier.media.temporal.parsedTimeStart

    const tracks = await getAudiobookTracks(audiobookAsset.filepath)

    using audiobook = await Audiobook.from(...tracks)

    return await locatorFromTime(audiobook, mediaRef.hrefPathname, time)
  }

  const charRef = (references.ebook ?? references.readaloud)?.find(
    (ref) => ref.fragmentKind === "char",
  )
  if (!charRef) return null

  assert(charRef.fragment.identifier?.kind === "char")

  const char = charRef.fragment.identifier.range.offset

  using epub = await Epub.using(MemoryAdapter).from(epubFilepath)

  const locator = await locatorFromCharacterCount(
    // Already confirmed to exist by `!epubFilepath` guard above
    // oxlint-disable-next-line typescript/no-non-null-assertion
    readaloud ?? ebook!,
    epub,
    charRef.hrefPathname,
    char,
  )
  if (!locator) return null

  const overlays = await getOverlayIndex(book)
  if (readaloud && overlays) {
    const isAnchorCandidate = (anchor: string) =>
      isOverlayAnchor(overlays, charRef.hrefPathname, anchor)
    const anchorRef = await characterCountToAnchorRef(
      epub,
      charRef.hrefPathname,
      char,
      isAnchorCandidate,
    )
    if (!anchorRef) return null

    assert(anchorRef.fragment.identifier?.kind === "anchor")

    const anchor = anchorRef.fragment.identifier.value

    locator.locations ??= {}
    locator.locations.fragments = [anchor]
  }

  return locator
}
