import { SeriesWithBooks } from "@/hooks/useFilterSortedSeries"
import { Box } from "@mantine/core"
import { useMemo } from "react"
import {
  AudiobookCoverImage,
  EbookCoverImage,
} from "../books/BookThumbnailImage"
import { useListBooksQuery } from "@/store/api"

interface Props {
  height: string
  width: string
  series: SeriesWithBooks
}

function getCssTransform(length: number, index: number) {
  if (length === 1) return ""
  if (length === 2) {
    switch (index) {
      case 0:
        return "scale(75%) translateY(-50%)"
      case 1:
        return "scale(75%) translateY(50%)"
    }
  }
  if (length === 3) {
    switch (index) {
      case 0:
        return `scale(100%) translate(0%, -25%)`
      case 1:
        return `scale(50%) translate(-50%, 50%)`
      case 2:
        return `scale(50%) translate(50%, 50%)`
    }
  }
  switch (index) {
    case 0:
      return `scale(50%) translate(-50%, -50%)`
    case 1:
      return `scale(50%) translate(50%, -50%)`
    case 2:
      return `scale(50%) translate(-50%, 50%)`
    case 3:
      return `scale(50%) translate(50%, 50%)`
    default:
      return ""
  }
}

export function SeriesThumbnailImage({ height, width, series }: Props) {
  const { data: books } = useListBooksQuery()
  const bookMap = useMemo(
    () => new Map(books?.map((book) => [book.uuid, book])),
    [books],
  )

  const orderedBooks = useMemo(
    () =>
      series.books
        .slice()
        .sort((a, b) => {
          const aPos = a.position ?? 0
          const bPos = b.position ?? 0
          return aPos - bPos
        })
        .slice(0, 4),
    [series.books],
  )

  return (
    <Box
      className="group/thumbnail relative"
      style={{ height, width, paddingTop: `calc((${height} - ${width}) / 2)` }}
    >
      {orderedBooks.map((relation, index) => {
        const book = bookMap.get(relation.bookUuid)
        if (!book) return null
        const transform = getCssTransform(orderedBooks.length, index)
        return !!book.readaloud || !!book.audiobook ? (
          <AudiobookCoverImage
            key={book.uuid}
            className="absolute rounded-none transition-transform"
            style={{
              zIndex: index,
              transform,
            }}
            book={book}
            height={width}
            width={width}
            imageHeight={147}
            imageWidth={147}
          />
        ) : (
          <EbookCoverImage
            key={book.uuid}
            className="absolute overflow-hidden rounded-none transition-transform"
            style={{
              zIndex: index,
              transform,
            }}
            book={book}
            height={width}
            width={width}
            // Re-use standard image size from main book list
            imageHeight={225}
            imageWidth={147}
          />
        )
      })}
    </Box>
  )
}
