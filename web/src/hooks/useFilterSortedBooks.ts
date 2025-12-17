import Fuse from "fuse.js"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useMemo,
  useState,
} from "react"

import { type BookWithRelations } from "@/database/books"
import { type UUID } from "@/uuid"

export type BookSortKey =
  | "title"
  | "author"
  | "align-time"
  | "create-time"
  | "publish-date"
export type SortDirection = "asc" | "desc"
export type BookSort = [BookSortKey, SortDirection]

const articlesByLanguage: Record<string, string[]> = {
  en: ["the ", "a ", "an "],
  de: [
    "der ",
    "die ",
    "das ",
    "den ",
    "dem ",
    "des ",
    "ein ",
    "einen ",
    "einem ",
    "eines ",
    "eine ",
    "einer ",
  ],
  // TODO: Need to confirm whether these should be ignored for sorting
  // fr: ["le ", "la ", "l'", "les ", "un ", "una ", "des "],
  // es: ["el ", "la ", "lo ", "los ", "las ", "un ", "una ", "unos ", "unas "],
  // nl: ["de ", "het ", "een "],
}

export function createComparisonTitle(title: string, locale: Intl.Locale) {
  const lower = title.toLowerCase()
  const articles = articlesByLanguage[locale.language]

  if (!articles) return lower

  const leadingArticle = articles.find((article) => lower.startsWith(article))
  if (leadingArticle) {
    return lower.slice(leadingArticle.length)
  }

  return lower
}

export type BookType =
  | "ebook"
  | "ebook-only"
  | "audiobook"
  | "audiobook-only"
  | "readaloud"
  | "ebook-audiobook-only"

export interface FilterSortOptions {
  onSearchChange: (value: string) => void
  search: string
  sort: BookSort
  onSortChange: Dispatch<SetStateAction<BookSort>>
  filters: {
    visible: boolean
    showFilters: () => void
    hideFilters: () => void
    collections: (UUID | "none")[] | null
    onCollectionsChange: (values: (UUID | "none")[] | null) => void
    tags: (UUID | "none")[] | null
    onTagsChange: (values: (UUID | "none")[] | null) => void
    series: UUID[] | null
    onSeriesChange: (values: UUID[] | null) => void
    statuses: UUID[] | null
    onStatusesChange: (values: UUID[] | null) => void
    authors: UUID[] | null
    onAuthorsChange: (values: UUID[] | null) => void
    bookTypes: BookType[] | null
    onBookTypesChange: (values: BookType[] | null) => void
    reset: () => void
  }
}

export function safeCreateLocale(book?: BookWithRelations, fallback = "en") {
  if (!book) return new Intl.Locale("en")
  try {
    return new Intl.Locale(book.language || fallback)
  } catch {
    console.error(
      `Book ${book.title} has unparseable language: "${book.language}"`,
    )
    return new Intl.Locale(fallback)
  }
}

export function useFilterSortedBooks(books: BookWithRelations[]): {
  books: BookWithRelations[]
  options: FilterSortOptions
} {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const fuse = useMemo(
    () =>
      new Fuse(books, {
        findAllMatches: true,
        ignoreDiacritics: true,
        keys: [
          "title",
          "authors.name",
          "description",
          "narrators.name",
          "creators.name",
        ],
        threshold: 0.4,
      }),
    [books],
  )
  const search = searchParams.get("search") ?? ""

  const sortString = searchParams.get("sort") ?? "title,asc"
  const sort = sortString.split(",") as BookSort

  const searched = useMemo(() => {
    if (search === "") return books
    const results = fuse.search(search)
    return results.map((f) => f.item)
  }, [books, fuse, search])

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

  const clearSearchParams = useCallback(() => {
    router.push(pathname)
  }, [pathname, router])

  const collections = (searchParams.get("collections")?.split(",") ?? null) as
    | (UUID | "none")[]
    | null

  const tags = (searchParams.get("tags")?.split(",") ?? null) as
    | (UUID | "none")[]
    | null

  const series = (searchParams.get("series")?.split(",") ?? null) as
    | UUID[]
    | null

  const statuses = (searchParams.get("statuses")?.split(",") ?? null) as
    | UUID[]
    | null

  const authors = (searchParams.get("authors")?.split(",") ?? null) as
    | UUID[]
    | null

  const bookTypes = (searchParams.get("bookTypes")?.split(",") ?? null) as
    | BookType[]
    | null

  const filtersActive = !!(
    collections ||
    tags ||
    series ||
    bookTypes ||
    authors ||
    statuses
  )

  const [showFilters, setShowFilters] = useState(false)

  const filtered = useMemo(
    () =>
      searched.filter((book) => {
        if (collections) {
          if (
            !book.collections.some((c) => collections.includes(c.uuid)) &&
            !(!book.collections.length && collections.includes("none"))
          ) {
            return false
          }
        }
        if (tags) {
          if (
            !book.tags.some((t) => tags.includes(t.uuid)) &&
            !(!book.tags.length && tags.includes("none"))
          ) {
            return false
          }
        }
        if (series) {
          if (!book.series.some((s) => series.includes(s.uuid))) {
            return false
          }
        }
        if (authors) {
          if (!book.authors.some((a) => authors.includes(a.uuid))) {
            return false
          }
        }
        if (statuses) {
          if (!book.status || !statuses.includes(book.status.uuid)) {
            return false
          }
        }
        if (bookTypes) {
          if (
            !bookTypes.some((type) => {
              switch (type) {
                case "ebook": {
                  return !!book.ebook
                }
                case "ebook-only": {
                  return (
                    book.ebook && !book.audiobook && !book.readaloud?.filepath
                  )
                }
                case "audiobook": {
                  return !!book.audiobook
                }
                case "audiobook-only": {
                  return (
                    book.audiobook && !book.ebook && !book.readaloud?.filepath
                  )
                }
                case "readaloud": {
                  return !!book.readaloud?.filepath
                }
                case "ebook-audiobook-only": {
                  return (
                    book.ebook && book.audiobook && !book.readaloud?.filepath
                  )
                }
              }
            })
          ) {
            return false
          }
        }
        return true
      }),
    [authors, bookTypes, collections, searched, series, statuses, tags],
  )

  const sorted = useMemo(
    () =>
      filtered.toSorted((a, b) => {
        const first = sort[1] === "asc" ? a : b
        const second = sort[1] === "asc" ? b : a
        const pubSort =
          // It's fine to pass null here — that will result in a date at the epoch
          // which will always sort first
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          new Date(first.publicationDate!).valueOf() -
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          new Date(second.publicationDate!).valueOf()
        switch (sort[0]) {
          case "title": {
            const firstTitle = createComparisonTitle(
              first.title,
              safeCreateLocale(first, "en"),
            )
            const secondTitle = createComparisonTitle(
              second.title,
              safeCreateLocale(second, "en"),
            )
            return firstTitle > secondTitle
              ? 1
              : firstTitle < secondTitle
                ? -1
                : pubSort
          }
          case "author": {
            const firstAuthor = first.authors[0]
            if (!firstAuthor) return -1
            const secondAuthor = second.authors[0]
            if (!secondAuthor) return 1
            return firstAuthor.name.toLowerCase() >
              secondAuthor.name.toLowerCase()
              ? 1
              : firstAuthor.name.toLowerCase() < secondAuthor.name.toLowerCase()
                ? -1
                : pubSort
          }
          case "align-time": {
            const firstAlignedAt = first.alignedAt
            if (!firstAlignedAt) return -1
            const secondAlignedAt = second.alignedAt
            if (!secondAlignedAt) return 1
            return (
              new Date(firstAlignedAt).valueOf() -
              new Date(secondAlignedAt).valueOf()
            )
          }
          case "create-time": {
            const firstCreatedAt = first.createdAt
            const secondCreatedAt = second.createdAt
            const createdSort =
              new Date(firstCreatedAt).valueOf() -
              new Date(secondCreatedAt).valueOf()
            return createdSort === 0 ? pubSort : createdSort
          }
          case "publish-date": {
            return pubSort
          }
        }
      }),
    [filtered, sort],
  )

  return {
    books: sorted,
    options: {
      onSearchChange: (value) => {
        setSearchParam("search", [value])
      },
      search: search,
      sort,
      onSortChange: (value) => {
        value = typeof value === "function" ? value(sort) : value
        setSearchParam("sort", [value.join(",")])
      },
      filters: useMemo(
        () => ({
          visible: showFilters || filtersActive,
          showFilters: () => {
            setShowFilters(true)
          },
          hideFilters: () => {
            clearSearchParams()
            setShowFilters(false)
          },
          collections,
          onCollectionsChange: (values) => {
            setSearchParam("collections", values)
          },
          tags,
          onTagsChange: (values) => {
            setSearchParam("tags", values)
          },
          series,
          onSeriesChange: (values) => {
            setSearchParam("series", values)
          },
          statuses,
          onStatusesChange: (values) => {
            setSearchParam("statuses", values)
          },
          authors,
          onAuthorsChange: (values) => {
            setSearchParam("authors", values)
          },
          bookTypes,
          onBookTypesChange: (values) => {
            setSearchParam("bookTypes", values)
          },
          reset: clearSearchParams,
        }),
        [
          authors,
          bookTypes,
          clearSearchParams,
          collections,
          filtersActive,
          series,
          setSearchParam,
          showFilters,
          statuses,
          tags,
        ],
      ),
    },
  }
}
