import { Box, Stack, UnstyledButton } from "@mantine/core"
import Link from "next/link"

import { type SeriesWithBooks } from "@/hooks/useFilterSortedSeries"
import { useListBooksQuery } from "@/store/api"

import { SeriesThumbnailImage } from "./SeriesThumbnailImages"

interface Props {
  series: SeriesWithBooks
  onClick?: () => void
}

export function SeriesThumbnail({ series, onClick }: Props) {
  const firstBook = series.books[0]
  const { book } = useListBooksQuery(undefined, {
    selectFromResult: (result) => ({
      book: result.data?.find((book) => book.uuid === firstBook?.bookUuid),
    }),
  })

  return (
    <Box className="group">
      <Stack gap={2} className="h-75.75">
        <Stack className="mb-1 h-56.25 flex-col justify-center">
          <UnstyledButton
            onClick={onClick}
            className="relative h-56.25 w-36.75"
          >
            <SeriesThumbnailImage
              height="14.0625rem"
              width="9.1875rem"
              series={series}
            />
          </UnstyledButton>
        </Stack>
        <UnstyledButton className="line-clamp-2 max-w-36.75 text-sm font-semibold group-hover:line-clamp-none">
          {series.name}
        </UnstyledButton>
        <Link
          className="hover:text-st-orange-600 max-w-36.75 pb-2 text-sm hover:underline"
          href={`/books?authors=${book?.authors[0]?.uuid}`}
        >
          {book?.authors[0]?.name}
        </Link>
      </Stack>
    </Box>
  )
}
