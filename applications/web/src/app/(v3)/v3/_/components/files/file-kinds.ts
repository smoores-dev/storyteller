// client-side counterparts of the server's audio/epub detection (@/audio pulls
// in node built-ins, so it can't be imported here). used to tell the upload
// dropzones apart and to count how many audio files a batch carries.

const AUDIO_EXTENSIONS = [
  ".mp3",
  ".m4a",
  ".m4b",
  ".mp4",
  ".aac",
  ".ogg",
  ".oga",
  ".mogg",
  ".opus",
  ".wav",
  ".aiff",
  ".flac",
  ".alac",
  ".weba",
]

function hasExtension(name: string, extensions: string[]) {
  const lower = name.toLowerCase()
  return extensions.some((extension) => lower.endsWith(extension))
}

export function isEpubFile(name: string) {
  return hasExtension(name, [".epub"])
}

// a zip is treated as an audiobook archive, same as the scanner does
export function isAudioLikeFile(name: string) {
  return hasExtension(name, [...AUDIO_EXTENSIONS, ".zip"])
}
