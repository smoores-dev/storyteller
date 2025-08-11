import { BookDetail } from "@/apiModels"
import { Dispatch, SetStateAction, useCallback, useMemo, useState } from "react"
import Fuse from "fuse.js"
import { UUID } from "@/uuid"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

export type BookSortKey = "title" | "author" | "align-time" | "create-time"
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

export function useFilterSortedBooks(books: BookDetail[]): {
  books: BookDetail[]
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
        keys: ["title", "authors.name", "description", "narrators.name"],
        threshold: 0.4,
      }),
    [books],
  )
  const search = searchParams.get("search") ?? ""

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

  const [showFilters, setShowFilters] = useState(
    !!(collections || tags || series || bookTypes),
  )

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
                  return book.ebook && !book.audiobook && !book.readaloud
                }
                case "audiobook": {
                  return !!book.audiobook
                }
                case "audiobook-only": {
                  return book.audiobook && !book.ebook && !book.readaloud
                }
                case "readaloud": {
                  return !!book.readaloud
                }
                case "ebook-audiobook-only": {
                  return book.ebook && book.audiobook && !book.readaloud
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

  const [sort, setSort] = useState<BookSort>(["title", "asc"])
  const sorted = useMemo(
    () =>
      filtered.toSorted((a, b) => {
        const first = sort[1] === "asc" ? a : b
        const second = sort[1] === "asc" ? b : a
        switch (sort[0]) {
          case "title": {
            const firstTitle = createComparisonTitle(
              first.title,
              new Intl.Locale(first.language ?? "en"),
            )
            const secondTitle = createComparisonTitle(
              second.title,
              new Intl.Locale(second.language ?? "en"),
            )
            return firstTitle > secondTitle
              ? 1
              : firstTitle < secondTitle
                ? -1
                : 0
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
                : 0
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
            const firstAlignedAt = first.createdAt
            const secondAlignedAt = second.createdAt
            return (
              new Date(firstAlignedAt).valueOf() -
              new Date(secondAlignedAt).valueOf()
            )
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
      onSortChange: setSort,
      filters: {
        visible: showFilters,
        showFilters: () => {
          setShowFilters(true)
        },
        hideFilters: () => {
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
      },
    },
  }
}
