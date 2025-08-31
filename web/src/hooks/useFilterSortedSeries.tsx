import { NewSeriesRelation, Series } from "@/database/series"
import {
  BookSort,
  createComparisonTitle,
  FilterSortOptions,
} from "./useFilterSortedBooks"
import Fuse from "fuse.js"
import { useCallback, useMemo, useState } from "react"
import { useListBooksQuery } from "@/store/api"
import { useRouter, usePathname, useSearchParams } from "next/navigation"

export type SeriesWithBooks = Series & { books: NewSeriesRelation[] }

export function useFilterSortedSeries(series: SeriesWithBooks[]): {
  series: SeriesWithBooks[]
  options: Omit<FilterSortOptions, "filters">
} {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const { data: books } = useListBooksQuery()
  const bookMap = useMemo(
    () => new Map(books?.map((book) => [book.uuid, book])),
    [books],
  )

  const search = searchParams.get("search") ?? ""

  const setSearchParam = useCallback(
    (name: string, values: string[] | null) => {
      const updated = new URLSearchParams(searchParams.toString())
      if (values === null) {
        updated.delete(name)
      } else {
        updated.set(name, values.join(","))
      }
      router.push(`${pathname}?${updated.toString()}`)
    },
    [pathname, router, searchParams],
  )

  const getFirstBook = useCallback(
    (s: SeriesWithBooks) => {
      const firstBook = s.books[0]
      return firstBook && bookMap.get(firstBook.bookUuid)
    },
    [bookMap],
  )

  const fuse = useMemo(
    () =>
      new Fuse(series, {
        findAllMatches: true,
        ignoreDiacritics: true,
        keys: ["name"],
        threshold: 0.4,
      }),
    [series],
  )
  const searched = useMemo(() => {
    if (search === "") return series
    const results = fuse.search(search)
    return results.map((f) => f.item)
  }, [series, fuse, search])

  const [sort, setSort] = useState<BookSort>(["title", "asc"])
  const sorted = useMemo(
    () =>
      searched.toSorted((a, b) => {
        const first = sort[1] === "asc" ? a : b
        const second = sort[1] === "asc" ? b : a
        switch (sort[0]) {
          case "title": {
            const firstTitle = createComparisonTitle(
              first.name,
              new Intl.Locale(getFirstBook(first)?.language ?? "en"),
            )
            const secondTitle = createComparisonTitle(
              second.name,
              new Intl.Locale(getFirstBook(second)?.language ?? "en"),
            )
            return firstTitle > secondTitle
              ? 1
              : firstTitle < secondTitle
                ? -1
                : 0
          }
          case "author": {
            const firstAuthor = getFirstBook(first)?.authors[0]
            if (!firstAuthor) return -1
            const secondAuthor = getFirstBook(second)?.authors[0]
            if (!secondAuthor) return 1
            return firstAuthor.name.toLowerCase() >
              secondAuthor.name.toLowerCase()
              ? 1
              : firstAuthor.name.toLowerCase() < secondAuthor.name.toLowerCase()
                ? -1
                : 0
          }
          case "align-time": {
            return 0
          }
          case "create-time": {
            const firstAlignedAt = first.createdAt
            const secondAlignedAt = second.createdAt
            return (
              new Date(firstAlignedAt).valueOf() -
              new Date(secondAlignedAt).valueOf()
            )
          }
          case "publish-date": {
            // It's fine to pass null here — that will result in a date at the epoch
            // which will always sort first
            return (
              // @ts-expect-error Date allows undefined
              new Date(getFirstBook(first)?.publicationDate).valueOf() -
              // @ts-expect-error Date allows undefined
              new Date(getFirstBook(second)?.publicationDate).valueOf()
            )
          }
        }
      }),
    [getFirstBook, searched, sort],
  )

  return {
    series: sorted,
    options: {
      onSearchChange: (value) => {
        setSearchParam("search", [value])
      },
      search: search,
      sort,
      onSortChange: setSort,
    },
  }
}
