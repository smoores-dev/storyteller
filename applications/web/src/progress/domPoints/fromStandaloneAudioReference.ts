import { type EpubReader } from "@storyteller-platform/epub"

import { type BookWithRelations } from "@/database/books.ts"
import { standaloneToReadaloudAudioReference } from "@/progress/audio/standaloneToReadaloud.ts"
import { type DomPointReference } from "@/progress/domPoints/domPoint.ts"
import { domPointFromReadaloudAudioReference } from "@/progress/domPoints/fromReadaloudAudioReference.ts"
import { type OverlayIndex } from "@/progress/overlayIndex.ts"
import { type UriReference } from "@/progress/uriReference.ts"

export async function domPointFromStandaloneAudioReference(
  book: BookWithRelations,
  epub: EpubReader,
  overlays: OverlayIndex,
  audioReference: UriReference,
): Promise<DomPointReference | null> {
  const readaloudAudioReference = await standaloneToReadaloudAudioReference(
    book,
    audioReference,
  )

  if (!readaloudAudioReference) return null

  return await domPointFromReadaloudAudioReference(
    epub,
    readaloudAudioReference,
    overlays,
  )
}
