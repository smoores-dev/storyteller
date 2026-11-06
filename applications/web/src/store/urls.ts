export function getDownloadUrl(
  bookUuid: string,
  format: "readaloud" | "audiobook" | "ebook",
) {
  const searchParams = new URLSearchParams({ format })
  return `/api/v2/books/${bookUuid}/files?${searchParams.toString()}`
}

export function getImageUrl(sha256: string, size?: number | null) {
  if (!size || !Number.isFinite(size) || size <= 0) {
    return `/api/v2/images/${sha256}`
  }

  return `/api/v2/images/${sha256}?s=${Math.round(size)}`
}

export function getCoverUrl(
  bookUuid: string,
  {
    height,
    width,
    updatedAt,
    audio = false,
  }: {
    height?: number
    width?: number
    audio?: boolean
    updatedAt: string | Date
  },
) {
  const searchParams = new URLSearchParams()
  if (audio) {
    searchParams.append("audio", "true")
  }

  if (height) {
    searchParams.append("h", height.toString())
  }

  if (width) {
    searchParams.append("w", width.toString())
  }

  return `/api/v2/books/${bookUuid}/cover?${searchParams.toString()}&v=${new Date(updatedAt).getTime()}`
}
