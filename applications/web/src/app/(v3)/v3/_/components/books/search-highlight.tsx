import { Fragment, useMemo } from "react"

import { cn } from "@v3/_/lib/utils"

import { type BookWithRelations } from "@/database/books"
import { type CreatorDisplayField, type DisplayField } from "@/sort"

export type SearchMatchCategory =
  | "title"
  | "subtitle"
  | "authors"
  | "narrators"
  | "series"
  | "description"

export type SearchMatch = {
  category: SearchMatchCategory
  text: string
  prefix?: string
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function computeSearchMatches(
  book: BookWithRelations,
  term: string,
): SearchMatch[] {
  if (!term) return []

  const lower = term.toLowerCase()
  const matches: SearchMatch[] = []

  if (book.title.toLowerCase().includes(lower)) {
    matches.push({ category: "title", text: book.title })
  }

  if (book.subtitle && book.subtitle.toLowerCase().includes(lower)) {
    matches.push({ category: "subtitle", text: book.subtitle })
  }

  const matchingAuthor = book.authors.find((a) =>
    a.name.toLowerCase().includes(lower),
  )

  if (matchingAuthor) {
    matches.push({ category: "authors", text: matchingAuthor.name })
  }

  const matchingNarrator = book.narrators.find((n) =>
    n.name.toLowerCase().includes(lower),
  )

  if (matchingNarrator) {
    matches.push({ category: "narrators", text: matchingNarrator.name })
  }

  const matchingSeries = book.series.find((s) =>
    s.name.toLowerCase().includes(lower),
  )

  if (matchingSeries) {
    matches.push({
      category: "series",
      text: matchingSeries.name,
      prefix: "in",
    })
  }

  if (book.description) {
    const plain = stripHtml(book.description)
    const matchIndex = plain.toLowerCase().indexOf(lower)

    if (matchIndex !== -1) {
      const snippetStart = Math.max(0, matchIndex - 40)
      const snippetEnd = Math.min(plain.length, matchIndex + term.length + 40)

      let snippet = plain.slice(snippetStart, snippetEnd).trim()
      if (snippetStart > 0) snippet = "\u2026" + snippet
      if (snippetEnd < plain.length) snippet = snippet + "\u2026"

      matches.push({ category: "description", text: snippet })
    }
  }

  return matches
}

const CATEGORY_TO_DISPLAY_FIELD: Partial<
  Record<SearchMatchCategory, DisplayField>
> = {
  title: "title",
  authors: "authors",
  narrators: "narrators",
  series: "seriesPosition",
}

const CREATOR_FIELDS: ReadonlySet<string> = new Set([
  "authors",
  "narrators",
  "translators",
  "creators",
])

export function computeSearchOverrides(
  displayFields: DisplayField[],
  matches: SearchMatch[],
  maxVisible = 2,
): {
  visibleCategories: Set<SearchMatchCategory>
  overrides: Map<DisplayField, SearchMatch>
  extraMatches: SearchMatch[]
} {
  const visibleCategories = new Set<SearchMatchCategory>()
  const overrides = new Map<DisplayField, SearchMatch>()
  const extraMatches: SearchMatch[] = []

  for (const match of matches) {
    const displayField = CATEGORY_TO_DISPLAY_FIELD[match.category]

    if (displayField && displayFields.includes(displayField)) {
      visibleCategories.add(match.category)
    }
  }

  const hiddenMatches = matches.filter(
    (m) => !visibleCategories.has(m.category),
  )

  // only replace creator-type fields that don't already have a match
  const replaceableFields = displayFields.filter((f) => {
    if (f === "title") return false
    if (!CREATOR_FIELDS.has(f)) return false

    const asCategory = f as SearchMatchCategory
    return !visibleCategories.has(asCategory)
  })

  let totalVisible = visibleCategories.size

  for (const match of hiddenMatches) {
    if (totalVisible >= maxVisible) break

    const fieldToReplace = replaceableFields.shift()

    if (fieldToReplace) {
      overrides.set(fieldToReplace, match)
    } else {
      extraMatches.push(match)
    }

    totalVisible++
  }

  return { visibleCategories, overrides, extraMatches }
}

export function useSearchMatches(
  book: BookWithRelations,
  search: string | null,
  displayFields: DisplayField[],
) {
  return useMemo(() => {
    if (!search) {
      return {
        matches: [] as SearchMatch[],
        visibleCategories: new Set<SearchMatchCategory>(),
        overrides: new Map<DisplayField, SearchMatch>(),
        extraMatches: [] as SearchMatch[],
      }
    }

    const matches = computeSearchMatches(book, search)
    const { visibleCategories, overrides, extraMatches } =
      computeSearchOverrides(displayFields, matches)

    return { matches, visibleCategories, overrides, extraMatches }
  }, [book, search, displayFields])
}

export function segmentText(
  text: string,
  term: string,
): { text: string; match: boolean }[] {
  if (!term) return [{ text, match: false }]

  const lower = text.toLowerCase()
  const lowerTerm = term.toLowerCase()
  const segments: { text: string; match: boolean }[] = []
  let lastIndex = 0

  let index = lower.indexOf(lowerTerm)

  while (index !== -1) {
    if (index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, index), match: false })
    }

    segments.push({
      text: text.slice(index, index + term.length),
      match: true,
    })

    lastIndex = index + term.length
    index = lower.indexOf(lowerTerm, lastIndex)
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), match: false })
  }

  return segments.length > 0 ? segments : [{ text, match: false }]
}

const MARK_CLASS = "bg-tint-strong text-inherit rounded-xs"

export function SearchHighlight({
  children,
  term,
  className,
}: {
  children: string
  term: string
  className?: string
}) {
  const segments = segmentText(children, term)

  return (
    <>
      {segments.map((segment, i) =>
        segment.match ? (
          <mark key={i} className={cn(MARK_CLASS, className)}>
            {segment.text}
          </mark>
        ) : (
          <Fragment key={i}>{segment.text}</Fragment>
        ),
      )}
    </>
  )
}

export function SearchMatchLine({
  match,
  term,
}: {
  match: SearchMatch
  term: string
}) {
  return (
    <p className="text-muted-foreground line-clamp-1 text-xs">
      {match.prefix && (
        <span className="text-muted-foreground/60">{match.prefix} </span>
      )}
      <SearchHighlight term={term}>{match.text}</SearchHighlight>
    </p>
  )
}

export function isCreatorDisplayField(
  field: DisplayField,
): field is CreatorDisplayField {
  return CREATOR_FIELDS.has(field)
}
