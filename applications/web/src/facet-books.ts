import {
  FACET_SECTION_REGISTRY,
  type FacetSection,
  type FacetSectionDef,
} from "@/facet-sections"
import { type FormatValue } from "@/fields"
import { type ShelfFilterField, type ShelfFilterNode } from "@/shelves"
import { type SortDirection, type SortField } from "@/sort"
import { type UUID } from "@/uuid"

export const NONE_KEY = "__none__"
export const ALL_KEY = "__all__"

export type FacetBooksDef = {
  toShelfFilter?: (itemKey: string) => ShelfFilterNode
  noneFilter?: ShelfFilterNode
  allFilter?: ShelfFilterNode
  scope?: "series" | "collection"
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
  if (!none) {
    return undefined
  }

  return emptyFilter(none.field, none.qualifier)
}

const GRADED_FILTER: ShelfFilterNode = {
  type: "condition",
  field: "alignmentGrade",
  operator: "isNotEmpty",
}

export const FACET_BOOKS = {
  series: {
    toShelfFilter: entityFilter("series"),
    noneFilter: sectionNoneFilter("series"),
    scope: "series",
    sort: {
      field: "seriesPosition",
      direction: "asc",
    },
  },
  authors: {
    toShelfFilter: creatorFilter("aut"),
    noneFilter: sectionNoneFilter("authors"),
  },
  narrators: {
    toShelfFilter: creatorFilter("nrt"),
    noneFilter: sectionNoneFilter("narrators"),
  },
  translators: {
    toShelfFilter: creatorFilter("trl"),
    noneFilter: sectionNoneFilter("translators"),
  },
  tags: {
    toShelfFilter: entityFilter("tags"),
    noneFilter: sectionNoneFilter("tags"),
  },
  collections: {
    toShelfFilter: entityFilter("collections"),
    noneFilter: sectionNoneFilter("collections"),
    scope: "collection",
  },
  statuses: {
    toShelfFilter: (itemKey: string): ShelfFilterNode => ({
      type: "condition",
      field: "status",
      operator: "is",
      value: itemKey,
    }),
    noneFilter: sectionNoneFilter("statuses"),
  },
  identifiers: {
    toShelfFilter: (itemKey: string): ShelfFilterNode => ({
      type: "condition",
      field: "identifiers",
      operator: "isNotEmpty",
      qualifier: itemKey,
    }),
    noneFilter: sectionNoneFilter("identifiers"),
  },
  publicationYears: {
    toShelfFilter: (itemKey: string): ShelfFilterNode => ({
      type: "condition",
      field: "publicationDate",
      operator: "between",
      value: [itemKey, `${itemKey}-12-31`],
    }),
    noneFilter: sectionNoneFilter("publicationYears"),
  },
  ratings: {
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
    toShelfFilter: (itemKey: string): ShelfFilterNode => ({
      type: "condition",
      field: "format",
      operator: "is",
      value: itemKey as FormatValue,
    }),
  },
  grades: {
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
    sort: {
      field: "alignmentGrade",
      direction: "desc",
    },
  },
  shelves: {},
} as const satisfies Record<FacetSection, FacetBooksDef>

export type FacetBooksQuery = {
  filter?: ShelfFilterNode
  series?: UUID
  collection?: UUID
}

export function facetBooksQuery(
  section: FacetBooksDef,
  itemKey: string,
): FacetBooksQuery {
  if (itemKey === NONE_KEY) {
    return section.noneFilter ? { filter: section.noneFilter } : {}
  }

  if (itemKey === ALL_KEY) {
    return section.allFilter ? { filter: section.allFilter } : {}
  }

  if (section.scope === "series") {
    return { series: itemKey as UUID }
  }

  if (section.scope === "collection") {
    return { collection: itemKey as UUID }
  }

  return section.toShelfFilter ? { filter: section.toShelfFilter(itemKey) } : {}
}
