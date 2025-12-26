import { useMemo } from "react"

import { type BookWithRelations } from "@/database/books"

export function useDownloadedFormats(book: BookWithRelations) {
  return useMemo(
    () =>
      [book.readaloud, book.ebook, book.audiobook]
        .filter((format) => format?.downloadStatus === "DOWNLOADED")
        .map((format) => format?.format),
    [book],
  )
}
