import { type BookWithRelations } from "@/database/books"

export const DOWNLOAD_FORMATS = ["ebook", "audiobook", "readaloud"] as const
export type DownloadFormat = (typeof DOWNLOAD_FORMATS)[number]

export const DOWNLOAD_SELECTIONS = [...DOWNLOAD_FORMATS, "all"] as const
export type DownloadSelection = (typeof DOWNLOAD_SELECTIONS)[number]

type DownloadableBook = Pick<BookWithRelations, DownloadFormat>

export function selectedFormats(
  selection: DownloadSelection,
): readonly DownloadFormat[] {
  return selection === "all" ? DOWNLOAD_FORMATS : [selection]
}

export function downloadableAsset<F extends DownloadFormat>(
  book: Pick<BookWithRelations, F>,
  format: F,
) {
  const asset = book[format]
  if (!asset?.filepath || asset.missing) {
    return null
  }

  return asset
}

export function downloadSummary(
  books: DownloadableBook[],
  selection: DownloadSelection,
) {
  let count = 0
  let bytes = 0

  for (const book of books) {
    const assets = selectedFormats(selection)
      .map((format) => downloadableAsset(book, format))
      .filter((asset) => asset !== null)

    if (assets.length === 0) {
      continue
    }

    count++
    for (const asset of assets) {
      bytes += asset.fileSize ?? 0
    }
  }

  return { count, bytes }
}
