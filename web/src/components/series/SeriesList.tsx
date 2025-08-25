"use client"

import { useListBooksQuery, useListSeriesQuery } from "@/store/api"
import { useMemo } from "react"
import { useFilterSortedSeries } from "@/hooks/useFilterSortedSeries"
import { Group, Stack, Text } from "@mantine/core"
import { Search } from "../books/Search"
import { Sort } from "../books/Sort"
import { SeriesGrid } from "./SeriesGrid"

export function SeriesList() {
  const { data: books } = useListBooksQuery()
  const { data: allSeries } = useListSeriesQuery()

  const seriesWithBooks = useMemo(
    () =>
      allSeries?.map((s) => ({
        ...s,
        books:
          books
            ?.map((b) => {
              const found = b.series.find((bs) => bs.uuid === s.uuid)
              if (!found) return null
              return {
                bookUuid: b.uuid,
                position: found.position,
                featured: found.featured,
              }
            })
            .filter((b) => !!b) ?? [],
      })) ?? [],
    [books, allSeries],
  )

  const { series, options } = useFilterSortedSeries(seriesWithBooks)

  return (
    <Stack>
      <Group>
        <Search value={options.search} onValueChange={options.onSearchChange} />
        <Sort value={options.sort} onValueChange={options.onSortChange} />
      </Group>
      {series.length ? (
        <SeriesGrid series={series} />
      ) : (
        <Text>There’s nothing here!</Text>
      )}
    </Stack>
  )
}
