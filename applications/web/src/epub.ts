import {
  Epub,
  type EpubReader,
  EpubVersionError,
  MemoryAdapter,
} from "@storyteller-platform/epub"
import { MediaType } from "@storyteller-platform/media-types"

export { EpubVersionError }

export function isEpubVersionError(e: unknown): e is EpubVersionError {
  return e instanceof EpubVersionError
}

export function isEpubFile(nameOrPath: string): boolean {
  return MediaType.fromPath(nameOrPath)?.kind === "ebook"
}

export async function isReadaloudEpub(epub: EpubReader): Promise<boolean> {
  const manifest = await epub.getManifest()
  return Object.values(manifest).some((item) => item.mediaOverlay)
}

export type EpubPreview = {
  title: string | null
  authors: string[]
  isReadaloud: boolean
  cover: Blob | null
}

export async function readEpubPreview(source: Blob): Promise<EpubPreview> {
  // no using, it's used in the browser
  const epub = await Epub.using(MemoryAdapter).from(source)
  try {
    const creators = await epub.getCreators()
    const coverItem = await epub.getCoverImageItem()
    return {
      title: await epub.getTitle(),
      authors: creators
        .filter((creator) => !creator.role || creator.role === "aut")
        .map((creator) => creator.name),
      isReadaloud: await isReadaloudEpub(epub),
      cover: coverItem
        ? new Blob(
            [new Uint8Array(await epub.readItemContents(coverItem.id))],
            { type: coverItem.mediaType ?? "" },
          )
        : null,
    }
  } finally {
    epub.discardAndClose()
  }
}
