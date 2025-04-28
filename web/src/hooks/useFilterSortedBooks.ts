import { BookDetail } from "@/apiModels"
import { useMemo, useState } from "react"
import Fuse from "fuse.js"

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

function createComparisonTitle(title: string, locale: Intl.Locale) {
  const lower = title.toLowerCase()
  const articles = articlesByLanguage[locale.language]

  if (!articles) return lower

  const leadingArticle = articles.find((article) => lower.startsWith(article))
  if (leadingArticle) {
    return lower.slice(leadingArticle.length)
  }

  return lower
}

export function useFilterSortedBooks(books: BookDetail[]) {
  const fuse = useMemo(
    () =>
      new Fuse(books, {
        findAllMatches: true,
        ignoreDiacritics: true,
        keys: ["title", "authors.name"],
      }),
    [books],
  )
  const [search, setSearch] = useState("")
  const filtered = useMemo(
    () => (search === "" ? books : fuse.search(search).map((f) => f.item)),
    [books, fuse, search],
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
    onFilterChange: setSearch,
    filter: search,
    sort,
    onSortChange: setSort,
  }
}
