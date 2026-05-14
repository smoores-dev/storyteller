/**
 * directory names used internally by storyteller inside each book's
 * asset folder. these must be excluded from discovery and fingerprinting
 * to avoid treating processed outputs as new audiobook inputs.
 */
export const INTERNAL_DIRECTORY_NAMES = new Set([
  "transcoded audio",
  "transcriptions",
  "ebook cover",
  "audiobook cover",
  ".storyteller",
])

/**
 * returns true if any segment of the path matches an internal directory name.
 */
export function isInsideInternalDirectory(fullPath: string): boolean {
  return fullPath
    .split("/")
    .some((segment) => INTERNAL_DIRECTORY_NAMES.has(segment))
}
