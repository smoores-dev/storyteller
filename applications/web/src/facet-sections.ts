import { type Permission } from "@/database/users"
import { type Field } from "@/fields"

export type FacetSectionDef = {
  slug: string | null
  labelBase: string
  badge: boolean
  emptyValuesPermission: Permission | null
  opds: boolean
  none: { field: Field; qualifier?: string } | null
}

export const FACET_SECTION_REGISTRY = {
  series: {
    slug: "series",
    labelBase: "Series",
    badge: true,
    emptyValuesPermission: "bookUpdate",
    opds: true,
    none: { field: "series" },
  },
  authors: {
    slug: "authors",
    labelBase: "Authors",
    badge: true,
    emptyValuesPermission: "bookUpdate",
    opds: true,
    none: { field: "creators", qualifier: "aut" },
  },
  narrators: {
    slug: "narrators",
    labelBase: "Narrators",
    badge: true,
    emptyValuesPermission: "bookUpdate",
    opds: true,
    none: { field: "creators", qualifier: "nrt" },
  },
  translators: {
    slug: "translators",
    labelBase: "Translators",
    badge: true,
    emptyValuesPermission: "bookUpdate",
    opds: true,
    none: { field: "creators", qualifier: "trl" },
  },
  tags: {
    slug: "tags",
    labelBase: "Tags",
    badge: true,
    emptyValuesPermission: "bookUpdate",
    opds: true,
    none: { field: "tags" },
  },
  collections: {
    slug: null,
    labelBase: "Collections",
    badge: false,
    emptyValuesPermission: null,
    opds: true,
    none: { field: "collections" },
  },
  statuses: {
    slug: "statuses",
    labelBase: "Status",
    badge: true,
    emptyValuesPermission: null,
    opds: true,
    none: { field: "status" },
  },
  publicationYears: {
    slug: "publication-years",
    labelBase: "PublicationYear",
    badge: true,
    // doesn't need one bc publicationYears is not a facet backed by a table
    emptyValuesPermission: null,
    opds: true,
    none: { field: "publicationDate" },
  },
  ratings: {
    slug: "ratings",
    labelBase: "Rating",
    badge: true,
    emptyValuesPermission: null,
    opds: true,
    none: { field: "userRating" },
  },
  formats: {
    slug: "formats",
    labelBase: "Formats",
    badge: false,
    emptyValuesPermission: null,
    opds: true,
    none: null,
  },
  grades: {
    slug: null,
    labelBase: "Grades",
    badge: false,
    emptyValuesPermission: null,
    opds: false,
    none: null,
  },
  shelves: {
    slug: null,
    labelBase: "Shelves",
    badge: false,
    emptyValuesPermission: null,
    opds: true,
    none: null,
  },
  identifiers: {
    slug: "identifiers",
    labelBase: "Identifier",
    badge: true,
    emptyValuesPermission: "bookUpdate",
    opds: false,
    none: { field: "identifiers" },
  },
} as const satisfies Record<string, FacetSectionDef>

export type FacetSection = keyof typeof FACET_SECTION_REGISTRY

export const FACET_SECTIONS = Object.keys(
  FACET_SECTION_REGISTRY,
) as FacetSection[]

export function isFacetSection(value: string): value is FacetSection {
  return value in FACET_SECTION_REGISTRY
}

export type BadgeFacetSection = {
  [S in FacetSection]: (typeof FACET_SECTION_REGISTRY)[S]["badge"] extends true
    ? S
    : never
}[FacetSection]

export const BADGE_FACET_SECTIONS = FACET_SECTIONS.filter(
  (s) => FACET_SECTION_REGISTRY[s].badge,
) as BadgeFacetSection[]

export type OpdsFacetSection = {
  [S in FacetSection]: (typeof FACET_SECTION_REGISTRY)[S]["opds"] extends true
    ? S
    : never
}[FacetSection]

export const OPDS_FACET_SECTIONS = FACET_SECTIONS.filter(
  (s) => FACET_SECTION_REGISTRY[s].opds,
) as OpdsFacetSection[]

export function opdsSectionPath(section: OpdsFacetSection): string {
  return FACET_SECTION_REGISTRY[section].slug ?? section
}

export const OPDS_SECTION_PATHS: Partial<Record<string, OpdsFacetSection>> =
  Object.fromEntries(OPDS_FACET_SECTIONS.map((s) => [opdsSectionPath(s), s]))

export const FACET_SECTION_SLUGS: Partial<Record<string, FacetSection>> =
  Object.fromEntries(
    FACET_SECTIONS.flatMap((s) => {
      const slug = FACET_SECTION_REGISTRY[s].slug
      return slug ? [[slug, s]] : []
    }),
  )
