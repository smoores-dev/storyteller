import { useMemo } from "react"

import { type BookWithRelations } from "@/database/books"

export function useAvailableFormats(
  book: BookWithRelations | undefined | null,
) {
  return useMemo(
    () =>
      book
        ? [book.readaloud, book.ebook, book.audiobook]
            .filter((format) => !!format)
            .map((format) => format.format)
        : [],
    [book],
  )
}
