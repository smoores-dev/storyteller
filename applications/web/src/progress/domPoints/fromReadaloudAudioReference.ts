import assert from "node:assert"
import { relative, dirname } from "node:path/posix"

import { type EpubReader, parse } from "@storyteller-platform/epub"

import { type DomPointReference } from "@/progress/domPoints/domPoint.ts"
import { domPointFromAnchor } from "@/progress/domPoints/fromAnchor.ts"
import {
  type OverlayIndex,
  resolveTimestampToAnchor,
} from "@/progress/overlayIndex.ts"
import { UriReference } from "@/progress/uriReference.ts"

export async function domPointFromReadaloudAudioReference(
  epub: EpubReader,
  audioReference: UriReference,
  overlays: OverlayIndex,
): Promise<DomPointReference | null> {
  const anchorRefString = resolveTimestampToAnchor(overlays, audioReference)
  if (!anchorRefString) return null

  const anchorRef = new UriReference(anchorRefString)
  assert(anchorRef.fragment.identifier?.kind === "anchor")

  const href = relative(
    dirname(await epub.getRootfile()),
    anchorRef.hrefPathname,
  )
  const contents = await epub.readFileContents(href, undefined, "utf-8")
  const doc = parse(contents, "application/xhtml+xml")

  const domPoint = domPointFromAnchor(doc, anchorRef.fragment.identifier.value)
  if (!domPoint) return null

  return {
    rootHref: anchorRef.hrefPathname,
    domPoint,
    doc,
  }
}
