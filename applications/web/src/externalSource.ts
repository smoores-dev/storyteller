import {
  type BookMetadataProvider,
  type CoverProvider,
} from "@storyteller-platform/nodekit/types"

import { type BookWithRelations } from "@/database/books"

export const KNOWN_SOURCES = {
  hardcover: {
    name: "Hardcover",
    logo: "/external/hardcover.svg",
    color: "#6366f1",
  },
  audible: {
    name: "Audible",
    logo: "/external/audible.svg",
    color: "#f7991c",
  },
} as const

export const PROVIDER_SOURCES = {
  audnexus: "audible",
  hardcover: "hardcover",
} as const satisfies Record<BookMetadataProvider, keyof typeof KNOWN_SOURCES>

export const PROVIDER_LABELS = {
  audnexus: "Audnexus",
  hardcover: "Hardcover",
  apple: "Apple Books",
} as const satisfies Record<BookMetadataProvider | CoverProvider, string>

export type ExternalDataRow = BookWithRelations["externalData"][number]

export function knownSource(row: ExternalDataRow) {
  const name = row.sourceName.toLowerCase()
  return name in KNOWN_SOURCES
    ? KNOWN_SOURCES[name as keyof typeof KNOWN_SOURCES]
    : null
}
