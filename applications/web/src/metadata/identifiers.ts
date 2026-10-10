import {
  type BookMetadataCandidate,
  type BookMetadataProvider,
} from "@storyteller-platform/nodekit/types"

import { type IdentifierKind } from "@/database/identifiers"
import { type ImportSource } from "@/metadataImportTypes"

export type ProposedIdentifier = {
  kind: IdentifierKind
  value: string
  provider: BookMetadataProvider
  carriesRating?: boolean
}

export const PROVIDER_IDENTIFIER_KINDS = {
  audnexus: ["audible", "isbn-13"],
  hardcover: [
    "hardcover-book-id",
    "hardcover-book-slug",
    "hardcover-edition-id",
    "isbn-13",
    "asin",
  ],
} as const satisfies Record<BookMetadataProvider, readonly IdentifierKind[]>

export const RATING_IDENTIFIER_KINDS = {
  audnexus: "audible",
  hardcover: "hardcover-book-id",
} as const satisfies Record<BookMetadataProvider, IdentifierKind>

export function identifierKey(identifier: {
  kind: string
  value: string
}): string {
  return `${identifier.kind}:${identifier.value}`
}

export function proposedIdentifiers(
  source: ImportSource,
  candidate: BookMetadataCandidate,
): ProposedIdentifier[] {
  const proposed: ProposedIdentifier[] = []
  const seen = new Set<string>()
  const accepted: readonly IdentifierKind[] =
    PROVIDER_IDENTIFIER_KINDS[source.provider]
  const ratingKind = RATING_IDENTIFIER_KINDS[source.provider]

  const push = (kind: IdentifierKind, value: string | undefined | null) => {
    const trimmed = value?.trim()
    if (!accepted.includes(kind) || !trimmed) return
    const key = identifierKey({ kind, value: trimmed })
    if (seen.has(key)) return
    seen.add(key)
    proposed.push({
      kind,
      value: trimmed,
      provider: source.provider,
      ...(kind === ratingKind && { carriesRating: true }),
    })
  }

  if (source.provider === "audnexus") {
    push("audible", source.id)
  }

  if (source.provider === "hardcover") {
    push("hardcover-book-id", candidate.id ?? source.id)
    push("hardcover-book-slug", candidate.slug)
    if (source.editionId) {
      push("hardcover-edition-id", source.editionId)
    }
  }

  const edition =
    candidate.editions?.find((entry) => entry.id === source.editionId) ??
    candidate.defaultAudioEdition
  if (edition) {
    push("isbn-13", edition.isbn13)
    push("asin", edition.asin)
  }

  return proposed
}
