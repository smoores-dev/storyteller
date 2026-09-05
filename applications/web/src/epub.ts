import { EpubVersionError } from "@storyteller-platform/epub"
import { MediaType } from "@storyteller-platform/media-types"

export { EpubVersionError }

export function isEpubVersionError(e: unknown): e is EpubVersionError {
  return e instanceof EpubVersionError
}

export function isEpubFile(nameOrPath: string): boolean {
  return MediaType.fromPath(nameOrPath)?.kind === "ebook"
}
