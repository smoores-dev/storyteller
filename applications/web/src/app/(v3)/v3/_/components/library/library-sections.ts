import { GRADE_COLORS } from "@v3/_/components/books/grade-pill"

import { isWellKnownStatus } from "@/database/statusKinds"
import {
  FACET_SECTION_REGISTRY,
  type FacetSection,
  type FacetSectionDef,
} from "@/facet-sections"
import { type FormatValue } from "@/fields"
import {
  type ShelfFilterField,
  type ShelfFilterIssue,
  type ShelfFilterNode,
} from "@/shelves"
import { GRADE_RANK, type SortDirection, type SortField } from "@/sort"
import { type ListBooksQueryArg } from "@/store/api"

export const NONE_KEY = "__none__"
export const ALL_KEY = "__all__"

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

export type LibrarySectionDef = {
  key: FacetSection
  toShelfFilter?: (itemKey: string) => ShelfFilterNode
  noneFilter?: ShelfFilterNode
  allFilter?: ShelfFilterNode
  entityType?: LibraryEntityType
  isItemLocked?: (item: FacetValue) => boolean
  compareItems?: (a: FacetValue, b: FacetValue) => number
  pinItem?: (item: FacetValue) => boolean
  itemColor?: (itemKey: string) => string | null | undefined
  sort?: {
    field: SortField
    direction: SortDirection
  }
}

function entityFilter(
  field: "tags" | "collections" | "series",
): (itemKey: string) => ShelfFilterNode {
  return (itemKey) => ({
    type: "condition",
    field,
    operator: "includes",
    value: [itemKey],
  })
}

function creatorFilter(role: string): (itemKey: string) => ShelfFilterNode {
  return (itemKey) => ({
    type: "condition",
    field: "creators",
    operator: "includes",
    value: [itemKey],
    qualifier: role,
  })
}

function emptyFilter(
  field: ShelfFilterField,
  qualifier?: string,
): ShelfFilterNode {
  return {
    type: "condition",
    field,
    operator: "isEmpty",
    ...(qualifier ? { qualifier } : {}),
  }
}

function sectionNoneFilter(section: FacetSection): ShelfFilterNode | undefined {
  const none: FacetSectionDef["none"] = FACET_SECTION_REGISTRY[section].none
  if (!none) return undefined
  return emptyFilter(none.field, none.qualifier)
}

const GRADED_FILTER: ShelfFilterNode = {
  type: "condition",
  field: "alignmentGrade",
  operator: "isNotEmpty",
}

export const librarySections = {
  series: {
    key: "series" as const,
    toShelfFilter: entityFilter("series"),
    noneFilter: sectionNoneFilter("series"),
    entityType: "series" as const,
    sort: {
      field: "seriesPosition",
      direction: "asc",
    },
  },
  authors: {
    key: "authors" as const,
    toShelfFilter: creatorFilter("aut"),
    noneFilter: sectionNoneFilter("authors"),
    entityType: "creator" as const,
  },
  narrators: {
    key: "narrators" as const,
    toShelfFilter: creatorFilter("nrt"),
    noneFilter: sectionNoneFilter("narrators"),
    entityType: "creator" as const,
  },
  translators: {
    key: "translators" as const,
    toShelfFilter: creatorFilter("trl"),
    noneFilter: sectionNoneFilter("translators"),
    entityType: "creator" as const,
  },
  tags: {
    key: "tags" as const,
    toShelfFilter: entityFilter("tags"),
    noneFilter: sectionNoneFilter("tags"),
    entityType: "tag" as const,
  },
  collections: {
    key: "collections" as const,
    toShelfFilter: entityFilter("collections"),
    noneFilter: sectionNoneFilter("collections"),
    entityType: "collection" as const,
  },
  statuses: {
    key: "statuses" as const,
    entityType: "status" as const,
    toShelfFilter: (itemKey: string): ShelfFilterNode => ({
      type: "condition",
      field: "status",
      operator: "is",
      value: itemKey,
    }),
    noneFilter: sectionNoneFilter("statuses"),
    pinItem: (item) => !!item.kind && isWellKnownStatus(item.kind),
    isItemLocked: (item) =>
      (!!item.kind && isWellKnownStatus(item.kind)) || item.key === NONE_KEY,
    compareItems: (a, b) => {
      if (a.key === NONE_KEY) return -1
      if (b.key === NONE_KEY) return 1
      return a.name.localeCompare(b.name)
    },
  },
  identifiers: {
    key: "identifiers" as const,
    entityType: "identifier" as const,
    toShelfFilter: (itemKey: string): ShelfFilterNode => ({
      type: "condition",
      field: "identifiers",
      operator: "isNotEmpty",
      qualifier: itemKey,
    }),
    noneFilter: sectionNoneFilter("identifiers"),
    isItemLocked: (item) => !!item.kind,
  },
  publicationYears: {
    key: "publicationYears" as const,
    toShelfFilter: (itemKey: string): ShelfFilterNode => ({
      type: "condition",
      field: "publicationDate",
      operator: "between",
      value: [itemKey, `${itemKey}-12-31`],
    }),
    noneFilter: sectionNoneFilter("publicationYears"),
  },
  ratings: {
    key: "ratings" as const,
    toShelfFilter: (itemKey: string): ShelfFilterNode => {
      const [min = 0, max = 5] = itemKey.split("-").map(Number)

      return {
        type: "condition",
        field: "userRating",
        operator: "between",
        value: [min, max],
      }
    },
    sort: {
      field: "userRating",
      direction: "desc",
    },
    noneFilter: sectionNoneFilter("ratings"),
  },
  formats: {
    key: "formats" as const,
    toShelfFilter: (itemKey: string): ShelfFilterNode => ({
      type: "condition",
      field: "format",
      operator: "is",
      value: itemKey as FormatValue,
    }),
  },
  grades: {
    key: "grades" as const,
    toShelfFilter: (itemKey: string): ShelfFilterNode =>
      itemKey === ALL_KEY
        ? GRADED_FILTER
        : {
            type: "condition",
            field: "alignmentGrade",
            operator: "is",
            value: itemKey,
          },
    allFilter: GRADED_FILTER,
    compareItems: (a, b) =>
      (GRADE_RANK[b.name] ?? -1) - (GRADE_RANK[a.name] ?? -1),
    itemColor: (key) =>
      key in GRADE_COLORS
        ? GRADE_COLORS[key as keyof typeof GRADE_COLORS]
        : null,
    sort: {
      field: "alignmentGrade",
      direction: "desc",
    },
  },
  shelves: {
    key: "shelves" as const,
    entityType: "shelf" as const,
  },
} as const satisfies Record<FacetSection, LibrarySectionDef>

export function sectionSeedQueryArg(
  section: LibrarySectionDef,
  itemKey: string,
): ListBooksQueryArg {
  if (itemKey === NONE_KEY) {
    return section.noneFilter ? { filter: section.noneFilter } : {}
  }

  if (itemKey === ALL_KEY) {
    return section.allFilter ? { filter: section.allFilter } : {}
  }

  if (section.entityType === "series") return { series: itemKey }
  if (section.entityType === "collection") return { collection: itemKey }

  return section.toShelfFilter ? { filter: section.toShelfFilter(itemKey) } : {}
}
