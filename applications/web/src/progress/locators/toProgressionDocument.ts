import { Epub, MemoryAdapter } from "@storyteller-platform/epub"
import { MediaType } from "@storyteller-platform/media-types"

import { type BookWithRelations } from "@/database/books.ts"
import { type ReadiumLocator } from "@/database/positions.ts"
import { mapValues } from "@/objects.ts"
import { locatorToCharacterCount } from "@/progress/locators/toChar.ts"
import { getAvailableAsset, resolveReferences } from "@/progress/references.ts"
import { type UriReference } from "@/progress/uriReference.ts"
import { type ProgressionDocument } from "@/schemas/v3/progress.ts"

export async function locatorToProgressionDocument(
  book: BookWithRelations,
  locator: ReadiumLocator,
  timestamp: number,
  deviceId: string,
): Promise<Partial<
  Record<
    "ebook" | "audiobook" | "readaloud",
    Omit<ProgressionDocument, "references"> & {
      references: UriReference[]
    }
  >
> | null> {
  let inputReference!: string
  let inputFormat!: "ebook" | "audiobook" | "readaloud"
  const mediaType = MediaType.fromMime(locator.type)
  if (mediaType?.kind === "audio") {
    const timeFragment = locator.locations?.fragments?.[0]
    if (!timeFragment) return null

    inputReference = `${locator.href}#${timeFragment}`
    inputFormat = "audiobook"
  } else {
    inputFormat = locator.locations?.fragments?.length ? "readaloud" : "ebook"

    const readaloud = getAvailableAsset(book, "readaloud")
    const ebook = getAvailableAsset(book, "ebook")

    const epubFilepath =
      inputFormat === "readaloud"
        ? readaloud?.filepath
        : (ebook?.filepath ?? readaloud?.filepath)
    if (!epubFilepath) return null

    using epub = await Epub.using(MemoryAdapter).from(epubFilepath)

    const chars = await locatorToCharacterCount(
      epub,
      locator,
      readaloud ? "fragments" : "progression",
    )

    if (chars === null) return null

    inputReference = `${locator.href}#char=${chars}`
  }

  const references = await resolveReferences(book, inputFormat, [
    inputReference,
  ])

  return mapValues(references, (refs) => ({
    title: locator.title,
    modified: new Date(timestamp).toISOString(),
    device: {
      id: deviceId,
      name: "Unknown",
    },
    progression: locator.locations?.totalProgression ?? 0,
    references: refs,
  }))
}
