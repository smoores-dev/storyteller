import { GRADE_COLORS } from "@v3/_/components/books/grade-pill"

import { isWellKnownStatus } from "@/database/statusKinds"
import {
  ALL_KEY,
  FACET_BOOKS,
  type FacetBooksDef,
  NONE_KEY,
  facetBooksQuery,
} from "@/facet-books"
import { type FacetSection } from "@/facet-sections"
import { type ShelfFilterIssue } from "@/shelves"
import { GRADE_RANK } from "@/sort"
import { type ListBooksQueryArg } from "@/store/api"

export { ALL_KEY, NONE_KEY }

export type FacetValue = {
  key: string
  name: string
  bookCount: number
  icon?: string | null
  color?: string | null
  kind?: string
  filterIssues?: ShelfFilterIssue[]
}

export type LibraryEntityType =
  | "tag"
  | "creator"
  | "series"
  | "collection"
  | "status"
  | "shelf"
  | "identifier"

export type LibrarySectionDef = FacetBooksDef & {
  key: FacetSection
  entityType?: LibraryEntityType
  isItemLocked?: (item: FacetValue) => boolean
  compareItems?: (a: FacetValue, b: FacetValue) => number
  pinItem?: (item: FacetValue) => boolean
  itemColor?: (itemKey: string) => string | null | undefined
}

export const librarySections = {
  series: {
    key: "series" as const,
    ...FACET_BOOKS.series,
    entityType: "series" as const,
  },
  authors: {
    key: "authors" as const,
    ...FACET_BOOKS.authors,
    entityType: "creator" as const,
  },
  narrators: {
    key: "narrators" as const,
    ...FACET_BOOKS.narrators,
    entityType: "creator" as const,
  },
  translators: {
    key: "translators" as const,
    ...FACET_BOOKS.translators,
    entityType: "creator" as const,
  },
  tags: {
    key: "tags" as const,
    ...FACET_BOOKS.tags,
    entityType: "tag" as const,
  },
  collections: {
    key: "collections" as const,
    ...FACET_BOOKS.collections,
    entityType: "collection" as const,
  },
  statuses: {
    key: "statuses" as const,
    ...FACET_BOOKS.statuses,
    entityType: "status" as const,
    pinItem: (item) => !!item.kind && isWellKnownStatus(item.kind),
    isItemLocked: (item) =>
      (!!item.kind && isWellKnownStatus(item.kind)) || item.key === NONE_KEY,
    compareItems: (a, b) => {
      if (a.key === NONE_KEY) {
        return -1
      }

      if (b.key === NONE_KEY) {
        return 1
      }

      return a.name.localeCompare(b.name)
    },
  },
  identifiers: {
    key: "identifiers" as const,
    ...FACET_BOOKS.identifiers,
    entityType: "identifier" as const,
    isItemLocked: (item) => !!item.kind,
  },
  publicationYears: {
    key: "publicationYears" as const,
    ...FACET_BOOKS.publicationYears,
  },
  ratings: {
    key: "ratings" as const,
    ...FACET_BOOKS.ratings,
  },
  formats: {
    key: "formats" as const,
    ...FACET_BOOKS.formats,
  },
  grades: {
    key: "grades" as const,
    ...FACET_BOOKS.grades,
    compareItems: (a, b) =>
      (GRADE_RANK[b.name] ?? -1) - (GRADE_RANK[a.name] ?? -1),
    itemColor: (key) =>
      key in GRADE_COLORS
        ? GRADE_COLORS[key as keyof typeof GRADE_COLORS]
        : null,
  },
  shelves: {
    key: "shelves" as const,
    ...FACET_BOOKS.shelves,
    entityType: "shelf" as const,
  },
} as const satisfies Record<FacetSection, LibrarySectionDef>

export function sectionSeedQueryArg(
  section: LibrarySectionDef,
  itemKey: string,
): ListBooksQueryArg {
  return facetBooksQuery(section, itemKey)
}
