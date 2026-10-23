import { MediaType } from "@storyteller-platform/media-types"

export const ATOM_NAV =
  `${MediaType.ATOM.mime};profile=opds-catalog;kind=navigation` as const
export const ATOM_ACQ =
  `${MediaType.ATOM.mime};profile=opds-catalog;kind=acquisition` as const
export const OPDS_JSON = MediaType.OPDS.mime
export const OPDS_PUBLICATION_JSON = MediaType.OPDS_PUBLICATION.mime
export const OPDS_AUTHENTICATION_JSON = MediaType.OPDS_AUTHENTICATION.mime
export const OPENSEARCH_XML = MediaType.OPENSEARCH_DESCRIPTION.mime
export const OPDS_PROGRESSION = MediaType.OPDS_PROGRESSION.mime

/**
 * all valid acquisition rels as an "enum"
 */
export const ACQUISITION_RELS = {
  acquisition: "http://opds-spec.org/acquisition",
  buy: "http://opds-spec.org/acquisition/buy",
  borrow: "http://opds-spec.org/acquisition/borrow",
  download: "http://opds-spec.org/acquisition/open-access",
  preview: "http://opds-spec.org/acquisition/sample",
  subscribe: "http://opds-spec.org/acquisition/subscribe",
} as const

export const PROGRESSION_REL = "http://opds-spec.org/progression" as const

/**
 * all valid acquisition rels as an array
 */
export const ACQUISITION_RELS_ARRAY = [
  ...Object.keys(ACQUISITION_RELS),
  ...Object.values(ACQUISITION_RELS),
]

export const THUMBNAIL_REL = "http://opds-spec.org/image/thumbnail" as const
