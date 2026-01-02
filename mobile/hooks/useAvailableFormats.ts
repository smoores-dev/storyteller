import { useMemo } from "react"

import { type BookWithRelations } from "@/database/books"

export function useAvailableFormats(
  book: BookWithRelations | undefined | null,
) {
  return useMemo(() => {
    const possibleFormats: (
      | BookWithRelations["ebook"]
      | BookWithRelations["audiobook"]
      | BookWithRelations["readaloud"]
      | undefined
    )[] = [book?.ebook, book?.audiobook]

    if (book?.readaloud?.status === "ALIGNED") {
      possibleFormats.push(book?.readaloud)
    }
    return book
      ? possibleFormats
          .filter((format) => !!format)
          .map((format) => format.format)
      : []
  }, [book])
}
