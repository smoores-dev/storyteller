import {
  type EpubReader,
  Epub,
  MemoryAdapter,
} from "@storyteller-platform/epub"
import { type UriFragment } from "@storyteller-platform/uri-fragment"

import { type BookWithRelations } from "@/database/books.ts"
import { readaloudToStandaloneAudioReference } from "@/progress/audio/readaloudToStandalone.ts"
import { convertEpubDomPointReference } from "@/progress/domPoints/convertEpubDomPointReference.ts"
import { type DomPointReference } from "@/progress/domPoints/domPoint.ts"
import { domPointFromReadaloudAudioReference } from "@/progress/domPoints/fromReadaloudAudioReference.ts"
import { domPointFromStandaloneAudioReference } from "@/progress/domPoints/fromStandaloneAudioReference.ts"
import { domPointReferenceFromXhtmlReferences } from "@/progress/domPoints/fromXhtmlReferences.ts"
import { domPointReferenceToAnchorReference } from "@/progress/domPoints/toAnchorReference.ts"
import { domPointReferenceToCharacterReference } from "@/progress/domPoints/toCharacterReference.ts"
import { domPointReferenceToCrengineXPointerReference } from "@/progress/domPoints/toCrengineXPointerReference.ts"
import { domPointReferenceToEpubCfiReference } from "@/progress/domPoints/toEpubCfiReference.ts"
import { domPointReferenceToReadaloudAudioReference } from "@/progress/domPoints/toReadaloudAudioReference.ts"
import { getOverlayIndex } from "@/progress/mediaOverlays.ts"
import { isOverlayAnchor } from "@/progress/overlayIndex.ts"
import { UriReference } from "@/progress/uriReference.ts"

type MediaIdentifier = Extract<
  NonNullable<UriFragment["identifier"]>,
  { kind: "media" }
>

const xhtmlFragmentPriority: (
  | NonNullable<UriFragment["identifier"]>["kind"]
  | "text"
  | null
)[] = ["char", "crengine", "epubcfi", "anchor", null]

function findXhtmlRefs(uriReferences: UriReference[]): UriReference[] {
  return uriReferences
    .filter((ref) => xhtmlFragmentPriority.includes(ref.fragmentKind))
    .toSorted(
      (a, b) =>
        xhtmlFragmentPriority.indexOf(a.fragmentKind) -
        xhtmlFragmentPriority.indexOf(b.fragmentKind),
    )
}

function findAudioRef(uriReferences: UriReference[]): UriReference | null {
  const mediaRef = uriReferences.find((ref) => ref.fragmentKind === "media")

  if (!mediaRef) return null

  const mediaIdentifier = mediaRef.fragment.identifier as MediaIdentifier

  // We only support temporal at the moment. In theory we
  // could also support id in the future
  if (!mediaIdentifier.media.temporal) {
    return null
  }

  return mediaRef
}

async function resolveMissingXhtmlReferences(
  epub: EpubReader,
  domPointRef: DomPointReference,
  existing: UriReference[],
  isAnchorCandidate?: (anchor: string) => boolean,
): Promise<UriReference[]> {
  const resolved = [...existing]

  if (!existing.some((ref) => ref.fragmentKind === "char")) {
    const charRef = domPointReferenceToCharacterReference(domPointRef)
    if (charRef) {
      resolved.push(charRef)
    }
  }

  if (!existing.some((ref) => ref.fragmentKind === "crengine")) {
    // char -> node -> xpointer (could just be node -> xpointer)
    const crengineRef = await domPointReferenceToCrengineXPointerReference(
      epub,
      domPointRef,
    )
    if (crengineRef) {
      resolved.push(crengineRef)
    }
  }

  if (!existing.some((ref) => ref.fragmentKind === "epubcfi")) {
    const cfiRef = await domPointReferenceToEpubCfiReference(epub, domPointRef)

    if (cfiRef) {
      resolved.push(cfiRef)
    }
  }

  if (!existing.some((ref) => ref.fragmentKind === "anchor")) {
    const anchorRef = domPointReferenceToAnchorReference(
      domPointRef,
      isAnchorCandidate,
    )

    if (anchorRef) {
      resolved.push(anchorRef)
    }
  }

  return resolved
}

export async function resolveReferences(
  book: BookWithRelations,
  format: "ebook" | "audiobook" | "readaloud",
  references: string[],
): Promise<
  Partial<Record<"ebook" | "audiobook" | "readaloud", UriReference[]>>
> {
  const uriReferences = references.map(
    (reference) => new UriReference(reference),
  )

  const xhtmlReferences = findXhtmlRefs(uriReferences)
  const audioReference = findAudioRef(uriReferences)

  let readaloudAudioReference =
    format === "readaloud" ? audioReference : undefined
  let standaloneAudioReference =
    format === "audiobook" ? audioReference : undefined

  if (!xhtmlReferences.length && !audioReference) {
    throw new Error(`No valid EPUB or audiobook references found.`)
  }

  using stack = new DisposableStack()

  const readaloud = getAvailableAsset(book, "readaloud")
  let readaloudEpub: EpubReader | undefined
  if (readaloud) {
    readaloudEpub = await Epub.using(MemoryAdapter).from(readaloud.filepath)
    stack.use(readaloudEpub)
  }

  const ebook = getAvailableAsset(book, "ebook")
  let standaloneEpub: EpubReader | undefined
  if (ebook) {
    standaloneEpub = await Epub.using(MemoryAdapter).from(ebook.filepath)
    stack.use(standaloneEpub)
  }

  const overlays = await getOverlayIndex(book)

  const result: Partial<
    Record<"ebook" | "audiobook" | "readaloud", UriReference[]>
  > = {}

  let domPointSource!: "ebook" | "readaloud"
  let domPointRef: DomPointReference | null = null
  if (format === "ebook" && standaloneEpub) {
    domPointSource = "ebook"
    domPointRef = await domPointReferenceFromXhtmlReferences(
      standaloneEpub,
      xhtmlReferences,
    )
  }

  if (format === "readaloud" && readaloudEpub) {
    domPointSource = "readaloud"
    domPointRef = await domPointReferenceFromXhtmlReferences(
      readaloudEpub,
      xhtmlReferences,
    )

    if (!domPointRef && audioReference && overlays) {
      domPointRef = await domPointFromReadaloudAudioReference(
        readaloudEpub,
        audioReference,
        overlays,
      )
    }
  }

  if (format === "audiobook" && readaloudEpub && overlays && audioReference) {
    domPointSource = "readaloud"
    domPointRef = await domPointFromStandaloneAudioReference(
      book,
      readaloudEpub,
      overlays,
      audioReference,
    )
  }

  if (!domPointRef) {
    // If we're unable to find a DOM point from the provided refs, just
    // save them as-is so that they round-trip, at least.
    result[format] = [...xhtmlReferences, audioReference].filter((ref) => !!ref)
    return result
  }

  const readaloudDomPointRef =
    domPointSource === "readaloud"
      ? domPointRef
      : readaloud && readaloudEpub
        ? await convertEpubDomPointReference(
            // If the source was the standalone, it must exist
            // oxlint-disable-next-line typescript/no-non-null-assertion
            standaloneEpub!,
            readaloudEpub,
            domPointRef,
          )
        : null

  const standaloneDomPointRef =
    domPointSource === "ebook"
      ? domPointRef
      : ebook && standaloneEpub
        ? await convertEpubDomPointReference(
            // If the source was the readaloud, it must exist
            // oxlint-disable-next-line typescript/no-non-null-assertion
            readaloudEpub!,
            standaloneEpub,
            domPointRef,
          )
        : null

  if (readaloudDomPointRef && !readaloudAudioReference && overlays) {
    readaloudAudioReference = domPointReferenceToReadaloudAudioReference(
      overlays,
      readaloudDomPointRef,
    )
  }

  if (readaloudDomPointRef && readaloudEpub && overlays) {
    const isAnchorCandidate = (anchor: string) =>
      isOverlayAnchor(overlays, readaloudDomPointRef.rootHref, anchor)
    const readaloudXhtmlReferences = await resolveMissingXhtmlReferences(
      readaloudEpub,
      readaloudDomPointRef,
      format === "readaloud" ? xhtmlReferences : [],
      isAnchorCandidate,
    )

    result.readaloud = [
      ...readaloudXhtmlReferences,
      readaloudAudioReference,
    ].filter((ref) => !!ref)
  }

  if (standaloneDomPointRef && standaloneEpub) {
    const ebookXhtmlReferences = await resolveMissingXhtmlReferences(
      standaloneEpub,
      standaloneDomPointRef,
      format === "ebook" ? xhtmlReferences : [],
    )
    result.ebook = ebookXhtmlReferences
  }

  const audiobook = getAvailableAsset(book, "audiobook")

  if ((audiobook && standaloneAudioReference) || readaloudAudioReference) {
    if (!standaloneAudioReference && readaloudAudioReference) {
      standaloneAudioReference = await readaloudToStandaloneAudioReference(
        book,
        readaloudAudioReference,
      )
    }

    if (standaloneAudioReference) {
      result.audiobook = [standaloneAudioReference]
    }
  }

  return result
}

export function getAvailableAsset<
  Format extends "ebook" | "readaloud" | "audiobook",
>(
  book: BookWithRelations,
  format: Format,
):
  | (Omit<NonNullable<BookWithRelations[Format]>, "filepath"> & {
      filepath: string
    })
  | null {
  if (!book[format]) return null

  if (format === "readaloud" && book.readaloud?.status !== "ALIGNED")
    return null

  if (!book[format].filepath || book[format].missing) return null

  return book[format] as Omit<
    NonNullable<BookWithRelations[Format]>,
    "filepath"
  > & {
    filepath: string
  }
}
