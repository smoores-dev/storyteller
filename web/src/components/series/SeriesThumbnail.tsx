import { SeriesWithBooks } from "@/hooks/useFilterSortedSeries"
import { Box, Stack, Text, UnstyledButton } from "@mantine/core"
import Link from "next/link"
import { SeriesThumbnailImage } from "./SeriesThumbnailImages"
import { useListBooksQuery } from "@/store/api"

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
    <UnstyledButton className="group" onClick={onClick}>
      <Stack gap={2} className="h-[18.9375rem]">
        <Stack className="mb-1 h-[14.0625rem] flex-col justify-center">
          <Box className="relative h-[14.0625rem] w-[9.1875rem]">
            <SeriesThumbnailImage
              height="14.0625rem"
              width="9.1875rem"
              series={series}
            />
          </Box>
        </Stack>
        <Text className="line-clamp-2 max-w-[9.1875rem] bg-white text-sm font-semibold group-hover:line-clamp-none">
          {series.name}
        </Text>
        <Link
          className="hover:text-st-orange-600 max-w-[9.1875rem] bg-white pb-2 text-sm hover:underline"
          href={`/books?authors=${book?.authors[0]?.uuid}`}
        >
          {book?.authors[0]?.name}
        </Link>
      </Stack>
    </UnstyledButton>
  )
}
