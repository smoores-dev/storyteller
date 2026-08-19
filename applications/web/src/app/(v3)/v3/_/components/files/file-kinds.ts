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

export function isAudioLikeFile(name: string) {
  return hasExtension(name, [...AUDIO_EXTENSIONS, ".zip"])
}
