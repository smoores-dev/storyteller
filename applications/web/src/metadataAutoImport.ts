import {
  type BookMetadataCandidate,
  type BookMetadataProvider,
} from "@storyteller-platform/nodekit"

import { type BookWithRelations } from "@/database/books"
import { readHardcoverToken } from "@/database/providerTokens"
import { getSetting } from "@/database/settings"
import { IMPORTABLE_FIELDS, type ImportableField } from "@/fields"
import { logger } from "@/logging"
import { proposedIdentifiers } from "@/metadata/identifiers"
import {
  MATCH_CONFIDENCES,
  type MatchConfidence,
  candidateFromSearchResult,
  rankEditionMatches,
  rankMatches,
} from "@/metadata/match"
import { subjectFromBook } from "@/metadata/subject"
import { applyMetadataImport } from "@/metadataImport"
import {
  type ImportFields,
  type ImportSource,
  type MetadataImportRequest,
  candidateFieldValue,
} from "@/metadataImportTypes"
import { getNodeKit } from "@/services/nodekitService"
import { type UUID } from "@/uuid"

const REGION = "us"

const AUDIO_FIRST_FIELDS: ReadonlySet<ImportableField> = new Set([
  "narrators",
  "releaseDate",
])

export type AutoImportStatus = "applied" | "unsure" | "noMatch" | "notSearched"

export type AutoImportResult = {
  status: AutoImportStatus
  book: BookWithRelations
  fields: ImportableField[]
  matches: { provider: BookMetadataProvider; confidence: MatchConfidence }[]
}

type ProviderMatch = {
  provider: BookMetadataProvider
  confidence: MatchConfidence
  candidate: BookMetadataCandidate
  source: ImportSource
}

function moreConfident(
  a: MatchConfidence,
  b: MatchConfidence | undefined,
): MatchConfidence {
  if (!b) return a
  return MATCH_CONFIDENCES.indexOf(a) <= MATCH_CONFIDENCES.indexOf(b) ? a : b
}

function meetsThreshold(
  confidence: MatchConfidence,
  threshold: MatchConfidence,
): boolean {
  return (
    MATCH_CONFIDENCES.indexOf(confidence) <=
    MATCH_CONFIDENCES.indexOf(threshold)
  )
}

function bookHasValue(book: BookWithRelations, field: ImportableField) {
  switch (field) {
    case "title":
      return !!book.title
    case "subtitle":
      return !!book.subtitle
    case "description":
      return !!book.description
    case "language":
      return !!book.language
    case "publicationDate":
      return !!book.publicationDate
    case "releaseDate":
      return !!book.releaseDate
    case "authors":
      return book.authors.length > 0
    case "narrators":
      return book.narrators.length > 0
    case "creators":
      return book.creators.length > 0
    case "series":
      return book.series.length > 0
    case "tags":
      return book.tags.length > 0
  }
}

async function providersFor(
  book: BookWithRelations,
): Promise<BookMetadataProvider[]> {
  const { token } = await readHardcoverToken()
  return [
    ...(book.audiobook || book.readaloud ? (["audnexus"] as const) : []),
    ...(token ? (["hardcover"] as const) : []),
  ]
}

async function findMatch(
  book: BookWithRelations,
  provider: BookMetadataProvider,
): Promise<ProviderMatch | null> {
  const subject = subjectFromBook(book)
  const query = [book.title, book.authors[0]?.name].filter(Boolean).join(" ")

  const found = await getNodeKit().metadataSearch({
    provider,
    query,
    region: REGION,
  })
  const top = rankMatches(subject, found.map(candidateFromSearchResult))[0]
  if (!top) return null

  const candidate = await getNodeKit().metadataBook({
    provider,
    id: top.candidate.id,
    region: REGION,
  })
  const edition = rankEditionMatches(subject, candidate)[0]

  return {
    provider,
    confidence: moreConfident(top.confidence, edition?.confidence),
    candidate,
    source: {
      provider,
      id:
        provider === "hardcover"
          ? (candidate.id ?? top.candidate.id)
          : top.candidate.id,
      region: REGION,
      ...(edition?.candidate.editionId && {
        editionId: edition.candidate.editionId,
      }),
    },
  }
}

function buildRequest(
  book: BookWithRelations,
  matches: ProviderMatch[],
): MetadataImportRequest {
  const fields: ImportFields = {}
  for (const field of IMPORTABLE_FIELDS) {
    if (bookHasValue(book, field)) continue
    const preferred = AUDIO_FIRST_FIELDS.has(field) ? "audnexus" : "hardcover"
    const ordered = [
      ...matches.filter((match) => match.provider === preferred),
      ...matches.filter((match) => match.provider !== preferred),
    ]
    for (const match of ordered) {
      const value = candidateFieldValue(match.candidate, field)
      if (value === undefined) continue
      fields[field] = value as never
      break
    }
  }

  return {
    fields,
    sources: matches.map((match) => match.source),
    identifiers: matches.flatMap((match) =>
      proposedIdentifiers(match.source, match.candidate).map(
        ({ kind, value, provider }) => ({ kind, value, provider }),
      ),
    ),
    ratingProviders: matches
      .filter((match) => typeof match.candidate.rating === "number")
      .map((match) => match.provider),
  }
}

export async function autoImportMetadata(
  book: BookWithRelations,
  userId?: UUID,
): Promise<AutoImportResult> {
  const thresholds = await getSetting("metadataAutoImportThresholds")
  const providers = await providersFor(book)
  if (!providers.length) {
    return { status: "notSearched", book, fields: [], matches: [] }
  }

  const matches: ProviderMatch[] = []
  for (const provider of providers) {
    try {
      const match = await findMatch(book, provider)
      if (match) matches.push(match)
    } catch (error) {
      logger.warn({
        err: error,
        msg: "Could not search a metadata provider",
        provider,
        bookUuid: book.uuid,
      })
    }
  }

  const summary = matches.map(({ provider, confidence }) => ({
    provider,
    confidence,
  }))
  const confident = matches.filter((match) =>
    meetsThreshold(match.confidence, thresholds[match.provider]),
  )

  if (!confident.length) {
    return {
      status: matches.length ? "unsure" : "noMatch",
      book,
      fields: [],
      matches: summary,
    }
  }

  const request = buildRequest(book, confident)
  const updated = await applyMetadataImport(
    book,
    request,
    userId,
    Object.fromEntries(
      confident.map((match) => [match.provider, match.candidate]),
    ),
  )

  return {
    status: "applied",
    book: updated,
    fields: Object.keys(request.fields) as ImportableField[],
    matches: summary,
  }
}
