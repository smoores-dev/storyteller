import assert from "node:assert"

import { type DomPointReference } from "@/progress/domPoints/domPoint.ts"
import { domPointReferenceToAnchorReference } from "@/progress/domPoints/toAnchorReference.ts"
import {
  isOverlayAnchor,
  type OverlayIndex,
  resolveAnchorToTimestamp,
} from "@/progress/overlayIndex.ts"
import { UriReference } from "@/progress/uriReference.ts"

export function domPointReferenceToReadaloudAudioReference(
  overlays: OverlayIndex,
  domPointRef: DomPointReference,
): UriReference | null {
  const isAnchorCandidate = (anchor: string) =>
    isOverlayAnchor(overlays, domPointRef.rootHref, anchor)

  const anchorRef = domPointReferenceToAnchorReference(
    domPointRef,
    isAnchorCandidate,
  )
  if (!anchorRef) return null

  const audioRefString = resolveAnchorToTimestamp(overlays, anchorRef)
  if (!audioRefString) return null

  // try/catch just in case we get an invalid range that
  // the UriFragment parser throws on
  try {
    const audioRef = new UriReference(audioRefString)
    assert(audioRef.fragment.identifier?.kind === "media")
    assert(audioRef.fragment.identifier.media.temporal)
    audioRef.fragment.identifier.media.temporal.timeEnd = undefined
    return audioRef
  } catch {
    return null
  }
}
