export const COVER_IMAGE_FILE_EXTENSIONS = [".jpeg", ".jpg", ".png", ".svg"]
export const MP3_FILE_EXTENSIONS = [".mp3"]
export const MPEG4_FILE_EXTENSIONS = [".mp4", ".m4a", ".m4b"]
export const AAC_FILE_EXTENSIONS = [".aac"]
export const OGG_FILE_EXTENSIONS = [".ogg", ".oga", ".mogg"]
export const OPUS_FILE_EXTENSIONS = [".opus"]
export const WAVE_FILE_EXTENSIONS = [".wav"]
export const AIFF_FILE_EXTENSIONS = [".aiff"]
export const FLAC_FILE_EXTENSIONS = [".flac"]
export const ALAC_FILE_EXTENSIONS = [".alac"]
export const WEBM_FILE_EXTENSIONS = [".weba"]

const AUDIO_FILE_EXTENSIONS = [
  ...MP3_FILE_EXTENSIONS,
  ...AAC_FILE_EXTENSIONS,
  ...MPEG4_FILE_EXTENSIONS,
  ...OPUS_FILE_EXTENSIONS,
  ...OGG_FILE_EXTENSIONS,
  ...WAVE_FILE_EXTENSIONS,
  ...AIFF_FILE_EXTENSIONS,
  ...FLAC_FILE_EXTENSIONS,
  ...ALAC_FILE_EXTENSIONS,
  ...WEBM_FILE_EXTENSIONS,
]

/**
 * Determines if a file with the given name or extension might contain audio.
 *
 * @remarks
 * Note that extension-based file type determination is only a heuristic; both
 * false negatives and false positives are possible.  False positives are
 * especially likely, since many file types can optionally contain audio.
 *
 * @param ext The extension (or complete filename) to check
 * @returns Whether the file *may* contain audio
 */
export function isAudioFile(filenameOrExt: string): boolean {
  return AUDIO_FILE_EXTENSIONS.some((ext) => filenameOrExt.endsWith(ext))
}

export function isZipArchive(filenameOrExt: string): boolean {
  return filenameOrExt.endsWith(".zip")
}

/**
 * Determine the mime type for a given audio file. If multiple possible
 * mime types exist for an extension, will always return the audio-specific
 * type.
 *
 * @remarks
 * The mime-db used by mime-types has several overloaded extensions,
 * which means that it often returns the incorrect type for our use
 * case
 *
 * @param filenameOrExt
 * @returns The mime type
 */
export function lookupAudioMime(filenameOrExt: string): string | null {
  if (MP3_FILE_EXTENSIONS.some((ext) => filenameOrExt.endsWith(ext))) {
    return "audio/mpeg"
  }
  if (MPEG4_FILE_EXTENSIONS.some((ext) => filenameOrExt.endsWith(ext))) {
    return "audio/mp4"
  }
  if (AAC_FILE_EXTENSIONS.some((ext) => filenameOrExt.endsWith(ext))) {
    return "audio/aac"
  }
  if (OGG_FILE_EXTENSIONS.some((ext) => filenameOrExt.endsWith(ext))) {
    return "audio/ogg"
  }
  if (OPUS_FILE_EXTENSIONS.some((ext) => filenameOrExt.endsWith(ext))) {
    return "audio/opus"
  }
  if (WAVE_FILE_EXTENSIONS.some((ext) => filenameOrExt.endsWith(ext))) {
    return "audio/wav"
  }
  if (AIFF_FILE_EXTENSIONS.some((ext) => filenameOrExt.endsWith(ext))) {
    return "audio/aiff"
  }
  if (FLAC_FILE_EXTENSIONS.some((ext) => filenameOrExt.endsWith(ext))) {
    return "audio/flac"
  }
  if (WEBM_FILE_EXTENSIONS.some((ext) => filenameOrExt.endsWith(ext))) {
    return "audio/webm"
  }
  return null
}
