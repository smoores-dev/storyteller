"use client"

import { Group, Stack, Text } from "@mantine/core"
import { useMemo } from "react"

import { Search } from "@/components/books/Search"
import { Sort } from "@/components/books/Sort"
import { useFilterSortedSeries } from "@/hooks/useFilterSortedSeries"
import { useListBooksQuery, useListSeriesQuery } from "@/store/api"

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
            .filter((b) => !!b)
            .sort(
              (a, b) =>
                parseFloat(a.position?.toString() ?? "0") -
                parseFloat(b.position?.toString() ?? "0"),
            ) ?? [],
      })) ?? [],
    [books, allSeries],
  )

  const { series, options } = useFilterSortedSeries(seriesWithBooks)

  return (
    <Stack>
      <Group className="mt-2">
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
