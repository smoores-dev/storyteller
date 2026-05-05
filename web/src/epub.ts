import { EpubVersionError } from "@storyteller-platform/epub"

export { EpubVersionError }

export function isEpubVersionError(e: unknown): e is EpubVersionError {
  return e instanceof EpubVersionError
}
