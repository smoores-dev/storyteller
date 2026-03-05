import {
  MP3_FILE_EXTENSIONS,
  MPEG4_FILE_EXTENSIONS,
  OPUS_FILE_EXTENSIONS,
} from "@storyteller-platform/audiobook"

export function areSameType(filepathA: string, filepathB: string) {
  if (filepathA === filepathB) {
    return true
  }
  if (
    MPEG4_FILE_EXTENSIONS.some((ext) => filepathA.endsWith(ext)) &&
    MPEG4_FILE_EXTENSIONS.some((ext) => filepathB.endsWith(ext))
  ) {
    return true
  }
  if (
    MP3_FILE_EXTENSIONS.some((ext) => filepathA.endsWith(ext)) &&
    MP3_FILE_EXTENSIONS.some((ext) => filepathB.endsWith(ext))
  ) {
    return true
  }
  if (
    OPUS_FILE_EXTENSIONS.some((ext) => filepathA.endsWith(ext)) &&
    OPUS_FILE_EXTENSIONS.some((ext) => filepathB.endsWith(ext))
  ) {
    return true
  }
  return false
}
