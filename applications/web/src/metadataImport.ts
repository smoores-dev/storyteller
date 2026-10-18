import { z } from "zod"

import {
  type BookMetadataCandidate,
  type BookMetadataProvider,
  COVER_PROVIDERS,
  type CoverCandidate,
} from "@storyteller-platform/nodekit"

import {
  type BookUpdate,
  type BookWithRelations,
  type CreatorRelation,
  type SeriesRelation,
  getBook,
  touchBook,
  updateBook,
} from "@/database/books"
import { db } from "@/database/connection"
import { upsertExternalData } from "@/database/externalSources"
import { type IdentifierKind } from "@/database/identifiers"
import { toIsoDateString } from "@/dates"
import { PROVIDER_SOURCES } from "@/externalSource"
import { ingestImage } from "@/images"
import {
  attachCover,
  audioCoverTargets,
  textCoverTargets,
} from "@/images/covers"
import { logger } from "@/logging"
import {
  RATING_IDENTIFIER_KINDS,
  identifierKey,
  proposedIdentifiers,
} from "@/metadata/identifiers"
import { isRole, marcRelators } from "@/metadata/marcRelators"
import {
  COVER_SIDES,
  type CoverSide,
  type ImportFields,
  type ImportSource,
  type MetadataImportRequest,
} from "@/metadataImportTypes"
import { getNodeKit } from "@/services/nodekitService"
import { type UUID } from "@/uuid"

function marcRoleFor(roleText: string): CreatorRelation["role"] {
  const trimmed = roleText.trim().toLowerCase()
  if (isRole(trimmed)) return trimmed

  return (
    marcRelators.find((relator) => relator.label.toLowerCase() === trimmed)
      ?.value ?? "ctb"
  )
}

function buildCreatorRelations(
  book: BookWithRelations,
  fields: ImportFields,
): CreatorRelation[] | undefined {
  if (!fields.authors && !fields.narrators && !fields.creators) {
    return undefined
  }

  const authors = fields.authors ?? book.authors.map((creator) => creator.name)
  const narrators =
    fields.narrators ?? book.narrators.map((creator) => creator.name)
  const others: CreatorRelation[] = fields.creators
    ? fields.creators.map((creator) => ({
        name: creator.name,
        fileAs: creator.name,
        role: marcRoleFor(creator.role),
      }))
    : book.creators.map((creator) => ({
        name: creator.name,
        fileAs: creator.fileAs,
        role: creator.role,
      }))

  return [
    ...authors.map((name) => ({ name, fileAs: name, role: "aut" as const })),
    ...narrators.map((name) => ({ name, fileAs: name, role: "nrt" as const })),
    ...others,
  ]
}

async function ensureIdentifier(
  book: BookWithRelations,
  kind: IdentifierKind,
  value: string,
): Promise<UUID | null> {
  const type = await db
    .selectFrom("identifierType")
    .select("uuid")
    .where("kind", "=", kind)
    .executeTakeFirst()
  if (!type) return null

  const existing = await db
    .selectFrom("identifier")
    .select("uuid")
    .where("bookUuid", "=", book.uuid)
    .where("identifierTypeUuid", "=", type.uuid)
    .where("value", "=", value)
    .where("ebookUuid", "is", null)
    .where("audiobookUuid", "is", null)
    .where("readaloudUuid", "is", null)
    .executeTakeFirst()
  if (existing) return existing.uuid

  const created = await db
    .insertInto("identifier")
    .values({ bookUuid: book.uuid, identifierTypeUuid: type.uuid, value })
    .returning("uuid")
    .executeTakeFirstOrThrow()

  return created.uuid
}

async function storeRating(
  identifierUuid: UUID,
  provider: BookMetadataProvider,
  rating: number,
) {
  const source = await db
    .selectFrom("externalSource")
    .select("uuid")
    .where("kind", "=", PROVIDER_SOURCES[provider])
    .executeTakeFirst()
  if (!source) return

  await upsertExternalData({
    identifierUuid,
    externalSourceUuid: source.uuid,
    rating,
    fetchedAt: new Date().toISOString(),
  })
}

async function linkImportSource(
  book: BookWithRelations,
  source: ImportSource,
  candidate: BookMetadataCandidate,
  request: MetadataImportRequest,
) {
  const storesRating =
    request.ratingProviders.includes(source.provider) &&
    typeof candidate.rating === "number"

  const selected = new Set(
    request.identifiers
      .filter((identifier) => identifier.provider === source.provider)
      .map(identifierKey),
  )

  const wanted = proposedIdentifiers(source, candidate).filter(
    (identifier) =>
      selected.has(identifierKey(identifier)) ||
      (storesRating && identifier.carriesRating),
  )

  for (const identifier of wanted) {
    const uuid = await ensureIdentifier(book, identifier.kind, identifier.value)
    if (identifier.carriesRating && storesRating && uuid) {
      await storeRating(uuid, source.provider, candidate.rating as number)
    }
  }
}

export async function applyMetadataImport(
  book: BookWithRelations,
  request: MetadataImportRequest,
  userId?: UUID,
  fetched: Partial<Record<BookMetadataProvider, BookMetadataCandidate>> = {},
): Promise<BookWithRelations> {
  const { fields } = request

  const update: BookUpdate = {
    ...(fields.title !== undefined && { title: fields.title }),
    ...(fields.subtitle !== undefined && { subtitle: fields.subtitle }),
    ...(fields.description !== undefined && {
      description: fields.description,
    }),
    ...(fields.language !== undefined && { language: fields.language }),
    ...(fields.publicationDate !== undefined && {
      publicationDate: toIsoDateString(fields.publicationDate),
    }),
    ...(fields.releaseDate !== undefined && {
      releaseDate: toIsoDateString(fields.releaseDate),
    }),
  }

  const creators = buildCreatorRelations(book, fields)
  const series: SeriesRelation[] | undefined = fields.series?.map(
    (entry, index) => {
      const position =
        typeof entry.position === "string"
          ? parseFloat(entry.position)
          : entry.position
      return {
        name: entry.name,
        position: position != null && !isNaN(position) ? position : null,
        featured: index === 0,
      }
    },
  )

  const updated = await updateBook(
    book.uuid,
    update,
    {
      ...(creators && { creators }),
      ...(series && { series }),
      ...(fields.tags && { tags: fields.tags }),
    },
    userId,
  )

  if (!request.sources.length) return updated

  for (const source of request.sources) {
    try {
      const candidate =
        fetched[source.provider] ??
        (await getNodeKit().metadataBook({
          provider: source.provider,
          id: source.id,
          region: source.region,
        }))
      await linkImportSource(updated, source, candidate, request)
    } catch (error) {
      logger.warn({
        err: error,
        msg: "Could not link a metadata import source",
        provider: source.provider,
        id: source.id,
      })
    }
  }

  return touchBook(book.uuid, userId)
}

export const CoverImportRequestSchema = z.object({
  search: z.object({
    title: z.string().optional(),
    author: z.string().optional(),
    query: z.string().optional(),
  }),
  covers: z
    .array(
      z.object({
        side: z.enum(COVER_SIDES),
        provider: z.enum(COVER_PROVIDERS),
        id: z.string().min(1),
      }),
    )
    .min(1)
    .refine(
      (covers) =>
        new Set(covers.map((pick) => pick.side)).size === covers.length,
      "Pick at most one cover per side",
    ),
})
export type CoverImportRequest = z.infer<typeof CoverImportRequestSchema>

export class CoverImportError extends Error {
  constructor(
    readonly code: "notOffered" | "unreadable",
    readonly side: CoverSide,
  ) {
    super(`Could not import the ${side} cover: ${code}`)
    this.name = "CoverImportError"
  }
}

export async function applyCoverImport(
  book: BookWithRelations,
  request: CoverImportRequest,
  userId?: UUID,
): Promise<{
  book: BookWithRelations
  files: Partial<Record<CoverSide, File>>
}> {
  const candidateKey = (candidate: Pick<CoverCandidate, "provider" | "id">) =>
    `${candidate.provider}:${candidate.id}`

  const offered = new Map(
    (
      await getNodeKit().coverSearch({
        ...request.search,
        providers: [...new Set(request.covers.map((pick) => pick.provider))],
      })
    ).map((candidate) => [candidateKey(candidate), candidate]),
  )

  const files: Partial<Record<CoverSide, File>> = {}
  for (const pick of request.covers) {
    const candidate = offered.get(candidateKey(pick))
    if (!candidate?.url.startsWith("https://")) {
      throw new CoverImportError("notOffered", pick.side)
    }

    const downloaded = await getNodeKit().download({
      url: candidate.url,
      provider: candidate.provider,
    })
    const image = await ingestImage(downloaded.bytes, {
      sourceName: downloaded.filename,
    })
    if (!image) throw new CoverImportError("unreadable", pick.side)

    const targets =
      pick.side === "text" ? textCoverTargets(book) : audioCoverTargets(book)
    await attachCover(book.uuid, targets, image, "user")
    files[pick.side] = new File(
      [new Uint8Array(downloaded.bytes)],
      downloaded.filename,
      {
        type: image.mimeType,
      },
    )
  }

  const updated = await getBook(book.uuid, userId)
  if (!updated) throw new Error(`Book ${book.uuid} disappeared during import`)
  return { book: updated, files }
}

const RATING_PROVIDERS = Object.fromEntries(
  Object.entries(RATING_IDENTIFIER_KINDS).map(([provider, kind]) => [
    kind,
    provider,
  ]),
) as Record<IdentifierKind, BookMetadataProvider | undefined>

export async function refreshExternalRatings(
  bookUuid: UUID,
  userId?: UUID,
): Promise<BookWithRelations> {
  const identifiers = await db
    .selectFrom("identifier")
    .innerJoin(
      "identifierType",
      "identifierType.uuid",
      "identifier.identifierTypeUuid",
    )
    .select(["identifier.uuid", "identifier.value", "identifierType.kind"])
    .where("identifier.bookUuid", "=", bookUuid)
    .where("identifier.ebookUuid", "is", null)
    .where("identifier.audiobookUuid", "is", null)
    .where("identifier.readaloudUuid", "is", null)
    .where("identifierType.kind", "in", Object.values(RATING_IDENTIFIER_KINDS))
    .execute()

  for (const identifier of identifiers) {
    const provider = identifier.kind && RATING_PROVIDERS[identifier.kind]
    if (!provider) continue

    try {
      const candidate = await getNodeKit().metadataBook({
        provider,
        id: identifier.value,
      })
      if (typeof candidate.rating === "number") {
        await storeRating(identifier.uuid, provider, candidate.rating)
      }
    } catch (error) {
      logger.warn({
        err: error,
        msg: "Could not refresh an external rating",
        provider,
        id: identifier.value,
      })
    }
  }

  return touchBook(bookUuid, userId)
}
