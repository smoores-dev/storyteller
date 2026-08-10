import {
  type ExpressionBuilder,
  type Insertable,
  type SelectQueryBuilder,
  type Selectable,
  type Transaction,
  type Updateable,
  sql,
} from "kysely"
import { jsonArrayFrom, jsonObjectFrom } from "kysely/helpers/sqlite"

import type { Audiobook as AudiobookAsset } from "@storyteller-platform/audiobook"
import type { EpubReader } from "@storyteller-platform/epub"

import type {
  ProcessingTaskStatus,
  ProcessingTaskType,
} from "@/apiModels/models/ProcessingStatus"
import { pathBelongsTo } from "@/assets/library/scanner/folder"
import {
  getMetadataFromAudiobook,
  getMetadataFromEpub,
} from "@/assets/metadata"
import { getDefaultSuffix, getSafeFilepathSegment } from "@/assets/paths"
import { toIsoDateString } from "@/dates"
import { ASSETS_DIR } from "@/directories"
import { BookEvents, type BookUpdatePayload } from "@/events"
import { type DistinctFacetField } from "@/fields"
import { type ShelfFilter } from "@/shelves"
import { type BookSort, type SortField } from "@/sort"
import type { UUID } from "@/uuid"

import { db } from "./connection"
import { type NewCreator } from "./creators"
import {
  type ExtractedIdentifiers,
  type NewIdentifier,
  linkExtractedIdentifiers,
} from "./identifiers"
import type { DB } from "./schema"
import type { NewSeries } from "./series"
import {
  bookVisibleTo,
  buildBookSearchExpression,
  buildFilterExpression,
  buildSortExpression,
} from "./shelfFilter"
import { getDefaultStatus } from "./statuses"
import { type NewUserBookRating } from "./userRatings"

/**
 * This function only exists to support old clients that haven't
 * started using UUIDs yet. It's not particularly efficient and should
 * be removed after we feel confident that all clients (specifically,
 * mobile apps) have likely been updated.
 */
export async function getBookUuid(bookIdOrUuid: string): Promise<UUID> {
  if (bookIdOrUuid.includes("-")) {
    // This is already a UUID, so just return it
    return bookIdOrUuid as UUID
  }

  // Otherwise, parse into an int and fetch the UUID from the db
  const bookId = parseInt(bookIdOrUuid, 10)

  const { uuid } = await db
    .selectFrom("book")
    .select(["uuid"])
    .where("id", "=", bookId)
    .executeTakeFirstOrThrow()

  return uuid
}

export type BookToCreator = Selectable<DB["bookToCreator"]>
export type NewBookToCreator = Insertable<DB["bookToCreator"]>
export type BookToCreatorUpdate = Updateable<DB["bookToCreator"]>

export type ProcessingStatus = {
  currentTask: ProcessingTaskType
  progress: number
  status: ProcessingTaskStatus
}

export type BookToCollection = Selectable<DB["bookToCollection"]>
export type NewBookToCollection = Insertable<DB["bookToCollection"]>
export type BookToCollectionUpdate = Updateable<DB["bookToCollection"]>

export type NewTag = Insertable<DB["tag"]>
export type TagUpdate = Updateable<DB["tag"]>

export type BookToTag = Selectable<DB["bookToTag"]>
export type NewBookToTag = Insertable<DB["bookToTag"]>
export type BookToTagUpdate = Updateable<DB["bookToTag"]>

export type BookToSeries = Selectable<DB["bookToSeries"]>
export type NewBookToSeries = Insertable<DB["bookToSeries"]>
export type BookToSeriesUpdate = Updateable<DB["bookToSeries"]>

export type BookToStatus = Selectable<DB["bookToStatus"]>
export type NewBookToStatus = Insertable<DB["bookToStatus"]>
export type BookToStatusUpdate = Updateable<DB["bookToStatus"]>

export type CreatorRelation = NewCreator &
  Omit<NewBookToCreator, "creatorUuid" | "bookUuid">
export type SeriesRelation = NewSeries &
  Omit<NewBookToSeries, "bookUuid" | "seriesUuid">
export type TagRelation = NewTag & NewBookToTag
export type StatusRelation = Omit<NewBookToStatus, "bookUuid">
export type UserBookRatingRelation = Omit<NewUserBookRating, "bookUuid">
export type IdentifierRelation = Omit<NewIdentifier, "bookUuid">

export type NewEbook = Insertable<DB["ebook"]>
export type Ebook = Selectable<DB["ebook"]>
export type EbookUpdate = Updateable<DB["ebook"]>

export type NewAudiobook = Insertable<DB["audiobook"]>
export type Audiobook = Selectable<DB["audiobook"]>
export type AudiobookUpdate = Updateable<DB["audiobook"]>

export type NewAlignedBook = Insertable<DB["readaloud"]>
export type Readaloud = Selectable<DB["readaloud"]>
export type ReadaloudUpdated = Updateable<DB["readaloud"]>

export type EbookRelation = Omit<NewEbook, "bookUuid">
export type AudiobookRelation = Omit<NewAudiobook, "bookUuid">
export type ReadaloudRelation = Omit<NewAlignedBook, "bookUuid">

export type Book = Selectable<DB["book"]>
export type NewBook = Insertable<DB["book"]>
export type BookUpdate = Updateable<DB["book"]>

export async function createBookFromEpub(
  epub: EpubReader,
  {
    uuid,
    title,
  }: {
    uuid?: UUID
    title: string
  },
  relations: {
    ebook?: EbookRelation
    audiobook?: AudiobookRelation
    readaloud?: ReadaloudRelation
    collections?: UUID[]
  } = {},
) {
  const {
    update,
    relations: epubRelations,
    identifiers,
  } = await getMetadataFromEpub(epub)

  return await createBook(
    {
      uuid,
      ...update,
      title: update?.title ?? title,
    },
    {
      ...relations,
      ...epubRelations,
      extractedIdentifiers: {
        format: relations.readaloud ? "readaloud" : "ebook",
        entries: identifiers,
      },
    },
  )
}

export async function createBookFromAudiobook(
  audiobook: AudiobookAsset,
  {
    uuid,
    title,
  }: {
    uuid?: UUID
    title: string
  },
  relations: {
    ebook?: EbookRelation
    audiobook?: AudiobookRelation
    readaloud?: ReadaloudRelation
    collections?: UUID[]
  } = {},
) {
  const {
    update,
    relations: audiobookRelations,
    identifiers,
  } = await getMetadataFromAudiobook(audiobook)

  return await createBook(
    {
      uuid,
      ...update,
      title: update?.title ?? title,
    },
    {
      ...relations,
      ...audiobookRelations,
      extractedIdentifiers: { format: "audiobook", entries: identifiers },
    },
  )
}

export async function createBook(
  insert: NewBook,
  relations: {
    creators?: CreatorRelation[]
    tags?: string[]
    series?: SeriesRelation[]
    ebook?: EbookRelation
    audiobook?: AudiobookRelation
    readaloud?: ReadaloudRelation
    collections?: UUID[]
    extractedIdentifiers?: ExtractedIdentifiers
  } = {},
) {
  let uuid!: UUID
  await db.transaction().execute(async (tr) => {
    const row = await tr
      .insertInto("book")
      .values({ ...insert, id: sql`ABS(RANDOM()) % 9007199254740990 + 1` })
      .returning(["uuid as uuid"])
      .executeTakeFirstOrThrow()

    uuid = row.uuid

    const desired = getSafeFilepathSegment(insert.title)
    const collision = await tr
      .selectFrom("book")
      .select(["uuid"])
      .where("assetDir", "=", desired)
      .where("uuid", "!=", uuid)
      .executeTakeFirst()

    const assetDir = collision
      ? getSafeFilepathSegment(insert.title, getDefaultSuffix(uuid))
      : desired

    await tr
      .updateTable("book")
      .set({ assetDir })
      .where("uuid", "=", uuid)
      .execute()

    if (relations.creators) {
      for (const creator of relations.creators) {
        let existing = await tr
          .selectFrom("creator")
          .select(["uuid"])
          .where((eb) =>
            creator.uuid
              ? eb.or([
                  eb("creator.name", "=", creator.name),
                  eb("creator.uuid", "=", creator.uuid),
                ])
              : eb("creator.name", "=", creator.name),
          )
          .executeTakeFirst()

        if (!existing) {
          existing = await tr
            .insertInto("creator")
            .values({
              name: creator.name,
              fileAs: creator.fileAs,
            })
            .returning(["uuid as uuid"])
            .executeTakeFirstOrThrow()
        }

        await tr
          .insertInto("bookToCreator")
          .values({
            creatorUuid: existing.uuid,
            bookUuid: uuid,
            role: creator.role,
          })
          .execute()
      }
    }

    if (relations.series) {
      for (const series of relations.series) {
        let existing = await tr
          .selectFrom("series")
          .select(["uuid"])
          .where((eb) =>
            series.uuid
              ? eb.or([
                  eb("series.name", "=", series.name),
                  eb("series.uuid", "=", series.uuid),
                ])
              : eb("series.name", "=", series.name),
          )
          .executeTakeFirst()

        if (!existing) {
          existing = await tr
            .insertInto("series")
            .values({
              name: series.name,
              description: series.description,
            })
            .returning(["uuid as uuid"])
            .executeTakeFirstOrThrow()
        }

        await tr
          .insertInto("bookToSeries")
          .values({
            seriesUuid: existing.uuid,
            bookUuid: uuid,
            position: series.position,
            featured: series.featured,
          })
          .onConflict((oc) =>
            oc.columns(["bookUuid", "seriesUuid"]).doNothing(),
          )
          .execute()
      }
    }

    if (relations.readaloud) {
      await tr
        .insertInto("readaloud")
        .values({ ...relations.readaloud, bookUuid: uuid })
        .execute()
    }

    if (relations.ebook) {
      await tr
        .insertInto("ebook")
        .values({ ...relations.ebook, bookUuid: uuid })
        .execute()
    }

    if (relations.audiobook) {
      await tr
        .insertInto("audiobook")
        .values({ ...relations.audiobook, bookUuid: uuid })
        .execute()
    }

    if (relations.extractedIdentifiers) {
      await linkExtractedIdentifiers(tr, uuid, relations.extractedIdentifiers)
    }

    if (relations.collections?.length) {
      const collections = relations.collections
      await tr
        .insertInto("bookToCollection")
        .columns(["bookUuid", "collectionUuid"])
        .expression((eb) =>
          eb
            .selectFrom(() =>
              collections
                .map((collection) =>
                  tr
                    .selectNoFrom([
                      eb.val(uuid).as("bookUuid"),
                      eb.val(collection).as("collectionUuid"),
                    ])
                    .where((web) =>
                      web.not(
                        web.exists(
                          web
                            .selectFrom("bookToCollection")
                            .select([web.lit(1).as("one")])
                            .where("bookUuid", "=", uuid)
                            .where("collectionUuid", "=", collection),
                        ),
                      ),
                    ),
                )
                .reduce((acc, expr) => acc.unionAll(expr))
                .as("values"),
            )
            .selectAll(),
        )
        .execute()
    }

    if (relations.tags) {
      const tags = relations.tags
      if (tags.length) {
        await tr
          .insertInto("tag")
          .columns(["name"])
          .expression((eb) =>
            eb
              .selectFrom(() =>
                tags
                  .map((tag) =>
                    tr.selectNoFrom([eb.val(tag).as("name")]).where((web) =>
                      web.not(
                        web.exists(
                          web
                            .selectFrom("tag")
                            .select([web.lit(1).as("one")])
                            .where("tag.name", "=", tag),
                        ),
                      ),
                    ),
                  )
                  .reduce((acc, expr) => acc.unionAll(expr))
                  .as("values"),
              )
              .selectAll(),
          )
          .execute()

        await tr
          .insertInto("bookToTag")
          .columns(["bookUuid", "tagUuid"])
          .expression((eb) =>
            eb
              .selectFrom(() =>
                tags
                  .map((tag) =>
                    eb
                      .selectFrom("tag")
                      .select([
                        eb.val(uuid).as("bookUuid"),
                        "tag.uuid as tagUuid",
                      ])
                      .where("tag.name", "=", tag)
                      .where((web) =>
                        web.not(
                          web.exists(
                            web
                              .selectFrom("bookToTag")
                              .select([web.lit(1).as("one")])
                              .innerJoin("tag", "tag.uuid", "tagUuid")
                              .where("bookUuid", "=", uuid)
                              .where("tag.name", "=", tag),
                          ),
                        ),
                      ),
                  )
                  .reduce((acc, expr) => acc.unionAll(expr))
                  .as("values"),
              )
              .selectAll(),
          )
          .execute()
      }
    }

    const libraryDefault = await getDefaultStatus(tr)

    const userRows = await tr
      .selectFrom("user")
      .leftJoin("userSettings", (join) =>
        join
          .onRef("userSettings.userId", "=", "user.id")
          .on("userSettings.name", "=", "defaultStatusUuid"),
      )
      .select(["user.id as userId", "userSettings.value as defaultOverride"])
      .execute()

    const allStatusUuids = new Set(
      (await tr.selectFrom("status").select("uuid").execute()).map(
        (s) => s.uuid,
      ),
    )

    const statusRows: {
      bookUuid: UUID
      statusUuid: UUID
      userId: UUID
    }[] = []

    const libraryDefaultUuid = libraryDefault?.uuid ?? null

    for (const { userId, defaultOverride } of userRows) {
      let statusUuid: UUID | null = libraryDefaultUuid

      // per-user override, validated against existing statuses
      if (defaultOverride) {
        try {
          const parsed = JSON.parse(defaultOverride) as unknown
          if (
            typeof parsed === "string" &&
            allStatusUuids.has(parsed as UUID)
          ) {
            statusUuid = parsed as UUID
          }
        } catch {
          /* use library default */
        }
      }

      if (statusUuid) {
        statusRows.push({ bookUuid: uuid, statusUuid, userId })
      }
    }

    if (statusRows.length > 0) {
      await tr.insertInto("bookToStatus").values(statusRows).execute()
    }
  })

  const book = await getBook(uuid)

  if (!book) {
    throw new Error("Failed te create book")
  }

  BookEvents.emit("message", {
    type: "bookCreated",
    bookUuid: book.uuid,
    payload: { ...book, status: (await getDefaultStatus()) ?? null },
  })

  return book
}

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters, @typescript-eslint/no-explicit-any
const identifiersQuery = <EB extends ExpressionBuilder<DB, any>>(
  eb: EB,
  relation?: { ebook?: boolean; audiobook?: boolean; readaloud?: boolean },
) => {
  return jsonArrayFrom(
    eb
      .selectFrom("identifier")
      .distinct()
      .innerJoin(
        "identifierType",
        "identifier.identifierTypeUuid",
        "identifierType.uuid",
      )
      .select([
        "identifierType.uuid",
        "identifierType.kind",
        "identifierType.name",
        "identifierType.urlTemplate",
        "identifierType.externalSourceUuid",
        "identifier.value",
      ])
      .where((eb) =>
        eb.and([
          eb("identifier.bookUuid", "=", eb.ref("book.uuid")),
          relation?.ebook
            ? eb("identifier.ebookUuid", "=", eb.ref("ebook.uuid"))
            : eb("identifier.ebookUuid", "is", null),
          relation?.audiobook
            ? eb("identifier.audiobookUuid", "=", eb.ref("audiobook.uuid"))
            : eb("identifier.audiobookUuid", "is", null),
          relation?.readaloud
            ? eb("identifier.readaloudUuid", "=", eb.ref("readaloud.uuid"))
            : eb("identifier.readaloudUuid", "is", null),
        ]),
      ),
  ).as("identifiers")
}

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters, @typescript-eslint/no-explicit-any
const externalDataQuery = <EB extends ExpressionBuilder<DB, any>>(eb: EB) => {
  return jsonArrayFrom(
    eb
      .selectFrom("externalData")
      .innerJoin("identifier", "identifier.uuid", "externalData.identifierUuid")
      .innerJoin(
        "externalSource",
        "externalSource.uuid",
        "externalData.externalSourceUuid",
      )
      .select([
        "externalData.uuid",
        "externalData.rating",
        "externalData.fetchedAt",
        "externalSource.uuid as sourceUuid",
        "externalSource.name as sourceName",
        "externalSource.color as sourceColor",
        "externalSource.url as sourceUrl",
        "externalSource.ratingIcon as sourceRatingIcon",
        "externalSource.ratingMin as sourceRatingMin",
        "externalSource.ratingMax as sourceRatingMax",
      ])
      .whereRef("identifier.bookUuid", "=", "book.uuid"),
  ).as("externalData")
}

type BooksQueryOptions = {
  includeManifest?: boolean
}

export function booksQuery(userId?: UUID, options?: BooksQueryOptions) {
  const includeManifest = options?.includeManifest ?? true
  return db
    .selectFrom("book")
    .selectAll("book")
    .select((eb) => [
      jsonArrayFrom(
        eb
          .selectFrom("bookToCreator")
          .innerJoin("creator", "creator.uuid", "bookToCreator.creatorUuid")
          .select([
            "creator.uuid",
            "creator.id",
            "creator.name",
            "creator.fileAs",
            "creator.createdAt",
            "creator.updatedAt",
          ])
          .whereRef("bookToCreator.bookUuid", "=", "book.uuid")
          .where("bookToCreator.role", "=", "aut"),
      ).as("authors"),
      jsonArrayFrom(
        eb
          .selectFrom("bookToCreator")
          .innerJoin("creator", "creator.uuid", "bookToCreator.creatorUuid")
          .select([
            "creator.uuid",
            "creator.id",
            "creator.name",
            "creator.fileAs",
            "creator.createdAt",
            "creator.updatedAt",
          ])
          .whereRef("bookToCreator.bookUuid", "=", "book.uuid")
          .where("bookToCreator.role", "=", "nrt"),
      ).as("narrators"),
      jsonArrayFrom(
        eb
          .selectFrom("bookToCreator")
          .innerJoin("creator", "creator.uuid", "bookToCreator.creatorUuid")
          .select([
            "creator.uuid",
            "creator.id",
            "creator.name",
            "creator.fileAs",
            "bookToCreator.role",
            "creator.createdAt",
            "creator.updatedAt",
          ])
          .whereRef("bookToCreator.bookUuid", "=", "book.uuid")
          .where("bookToCreator.role", "!=", "nrt")
          .where("bookToCreator.role", "!=", "aut"),
      ).as("creators"),
      jsonArrayFrom(
        eb
          .selectFrom("bookToSeries")
          .innerJoin("series", "series.uuid", "bookToSeries.seriesUuid")
          .select([
            "series.uuid",
            "series.name",
            "bookToSeries.featured",
            "bookToSeries.position",
            "series.createdAt",
            "series.updatedAt",
          ])
          .whereRef("bookToSeries.bookUuid", "=", "book.uuid"),
      ).as("series"),
      jsonArrayFrom(
        eb
          .selectFrom("bookToTag")
          .innerJoin("tag", "tag.uuid", "bookToTag.tagUuid")
          .select([
            "tag.uuid",
            "tag.name",
            "tag.icon",
            "tag.color",
            "tag.createdAt",
            "tag.updatedAt",
          ])
          .whereRef("bookToTag.bookUuid", "=", "book.uuid"),
      ).as("tags"),
      jsonArrayFrom(
        eb
          .selectFrom("bookToCollection")
          .innerJoin(
            "collection",
            "collection.uuid",
            "bookToCollection.collectionUuid",
          )
          .select([
            "collection.uuid",
            "collection.name",
            "collection.description",
            "collection.public",
            "collection.icon",
            "collection.color",
            "collection.createdAt",
            "collection.updatedAt",
          ])
          .whereRef("bookToCollection.bookUuid", "=", "book.uuid"),
      ).as("collections"),
      identifiersQuery(eb),
      externalDataQuery(eb),
      ...(userId
        ? [
            jsonObjectFrom(
              eb
                .selectFrom("bookToStatus")
                .innerJoin("status", "status.uuid", "bookToStatus.statusUuid")
                .select([
                  "status.uuid",
                  "status.name",
                  "status.label",
                  "status.createdAt",
                  "status.updatedAt",
                ])
                .whereRef("bookToStatus.bookUuid", "=", "book.uuid")
                .where("bookToStatus.userId", "=", userId),
            ).as("status"),
            jsonObjectFrom(
              eb
                .selectFrom("position")
                .select([
                  "position.uuid",
                  "position.locator",
                  "position.timestamp",
                  "position.createdAt",
                  "position.updatedAt",
                ])
                .whereRef("position.bookUuid", "=", "book.uuid")
                .where("position.userId", "=", userId),
            ).as("position"),
            jsonObjectFrom(
              eb
                .selectFrom("userBookRating")
                .select([
                  "userBookRating.rating",
                  "userBookRating.review",
                  "userBookRating.dimensions",
                ])
                .whereRef("userBookRating.bookUuid", "=", "book.uuid")
                .where("userBookRating.userId", "=", userId),
            ).as("userBookRating"),
          ]
        : []),

      jsonObjectFrom(
        eb
          .selectFrom("alignmentReport")
          .select([
            "alignmentReport.grade",
            "alignmentReport.score",
            "alignmentReport.missingSentences",
            "alignmentReport.mutedChapters",
            "alignmentReport.failedChapters",
            "alignmentReport.unalignedAudio",
          ])
          .whereRef("alignmentReport.bookUuid", "=", "book.uuid")
          .orderBy("alignmentReport.createdAt", "desc")
          .limit(1),
      ).as("alignmentSummary"),

      jsonObjectFrom(
        eb
          .selectFrom("ebook")
          .select((eb) => [
            "ebook.uuid",
            "ebook.filepath",
            "ebook.missing",
            "ebook.coverImageUuid",
            "ebook.coverOrigin",
            "ebook.coverExtractedFrom",
            jsonObjectFrom(
              eb
                .selectFrom("image")
                .select([
                  "image.uuid",
                  "image.sha256",
                  "image.mimeType",
                  "image.width",
                  "image.height",
                  "image.blurhash",
                  "image.colors",
                ])
                .whereRef("image.uuid", "=", "ebook.coverImageUuid"),
            ).as("coverImage"),
            "ebook.isEpub2",
            "ebook.createdAt",
            "ebook.updatedAt",
            "ebook.fingerprint",
            "ebook.pageCount",
            "ebook.fileSize",
            identifiersQuery(eb, { ebook: true }),
          ])
          .$if(includeManifest, (eb) => eb.select(["ebook.manifest"]))
          .whereRef("ebook.bookUuid", "=", "book.uuid"),
      ).as("ebook"),
      jsonObjectFrom(
        eb
          .selectFrom("audiobook")
          .select((eb) => [
            "audiobook.uuid",
            "audiobook.filepath",
            "audiobook.missing",
            "audiobook.coverImageUuid",
            "audiobook.coverOrigin",
            "audiobook.coverExtractedFrom",
            jsonObjectFrom(
              eb
                .selectFrom("image")
                .select([
                  "image.uuid",
                  "image.sha256",
                  "image.mimeType",
                  "image.width",
                  "image.height",
                  "image.blurhash",
                  "image.colors",
                ])
                .whereRef("image.uuid", "=", "audiobook.coverImageUuid"),
            ).as("coverImage"),
            "audiobook.createdAt",
            "audiobook.updatedAt",
            "audiobook.fingerprint",
            "audiobook.duration",
            "audiobook.fileSize",
            identifiersQuery(eb, { audiobook: true }),
          ])
          .$if(includeManifest, (eb) => eb.select(["audiobook.manifest"]))
          .whereRef("audiobook.bookUuid", "=", "book.uuid"),
      ).as("audiobook"),
      jsonObjectFrom(
        eb
          .selectFrom("readaloud")
          .select((eb) => [
            "readaloud.uuid",
            "readaloud.filepath",
            "readaloud.missing",
            "readaloud.coverImageUuid",
            "readaloud.coverOrigin",
            "readaloud.coverExtractedFrom",
            jsonObjectFrom(
              eb
                .selectFrom("image")
                .select([
                  "image.uuid",
                  "image.sha256",
                  "image.mimeType",
                  "image.width",
                  "image.height",
                  "image.blurhash",
                  "image.colors",
                ])
                .whereRef("image.uuid", "=", "readaloud.coverImageUuid"),
            ).as("coverImage"),
            "readaloud.isEpub2",
            "readaloud.status",
            "readaloud.currentStage",
            "readaloud.stageProgress",
            "readaloud.queuePosition",
            "readaloud.restartPending",
            "readaloud.createdAt",
            "readaloud.updatedAt",
            "readaloud.fingerprint",
            "readaloud.pageCount",
            "readaloud.duration",
            "readaloud.fileSize",
            identifiersQuery(eb, { readaloud: true }),
          ])
          .$if(includeManifest, (eb) => eb.select(["readaloud.manifest"]))
          .whereRef("readaloud.bookUuid", "=", "book.uuid"),
      ).as("readaloud"),
      // the active processing job for this book, if any. config is intentionally
      // excluded - it carries api keys and never goes to the client.
      jsonObjectFrom(
        eb
          .selectFrom("job")
          .select([
            "job.uuid",
            "job.bookUuid",
            "job.type",
            "job.status",
            "job.stage",
            "job.progress",
            "job.position",
            "job.error",
            "job.createdAt",
            "job.updatedAt",
            "job.startedAt",
            "job.finishedAt",
          ])
          .whereRef("job.bookUuid", "=", "book.uuid")
          .where("job.status", "in", ["QUEUED", "RUNNING", "PAUSED"])
          .orderBy("job.createdAt", "desc")
          .limit(1),
      ).as("processingJob"),
    ])
    .$if(!!userId, (qb) =>
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      qb.where((eb) => bookVisibleTo(eb, userId!)),
    )
    .groupBy("book.uuid")
}

export async function getAlignedReadaloudBooks(userId?: UUID) {
  return await booksQuery(userId)
    .innerJoin("readaloud", "readaloud.bookUuid", "book.uuid")
    .where("readaloud.filepath", "is not", null)
    .orderBy("readaloud.createdAt", "desc")
    .orderBy(sql`book.rowid`, "desc")
    .execute()
}

export async function getQueuedBooks() {
  return await booksQuery()
    .innerJoin("readaloud", "readaloud.bookUuid", "book.uuid")
    .where((qb) =>
      qb.or([
        qb("readaloud.status", "=", "QUEUED"),
        qb("readaloud.status", "=", "PROCESSING"),
      ]),
    )
    .orderBy("readaloud.queuePosition", "asc")
    .execute()
}

export async function getNextQueuePosition() {
  const book = await booksQuery()
    .innerJoin("readaloud", "readaloud.bookUuid", "book.uuid")
    .where((qb) =>
      qb.or([
        qb("readaloud.status", "=", "QUEUED"),
        qb("readaloud.status", "=", "PROCESSING"),
      ]),
    )
    .orderBy("readaloud.queuePosition", "desc")
    .limit(1)
    .executeTakeFirst()

  if (!book) return 0

  const latestPosition = book.readaloud?.queuePosition ?? 0
  return latestPosition + 1
}

export type GetBooksOptions = {
  limit?: number
  offset?: number
  orderBy?: SortField
  orderDirection?: "asc" | "desc"
  sort?: BookSort
  filter?: ShelfFilter
  search?: string
  collection?: UUID
  series?: UUID
  mediaFilter?: "ebook" | "audiobook" | "synced"
  status?: UUID
  includeManifest?: boolean
}

function applyBookFilters<O>(
  query: SelectQueryBuilder<DB, "book", O>,
  bookUuids: UUID[] | null,
  userId: UUID | undefined,
  opts: GetBooksOptions | undefined,
): SelectQueryBuilder<DB, "book", O> {
  return (
    query
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      .$if(!!bookUuids, (qb) => qb.where("book.uuid", "in", bookUuids!))
      .$if(!!opts?.search, (qb) =>
        qb.where((eb) =>
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          buildBookSearchExpression(eb, opts!.search!),
        ),
      )
      .$if(!!opts?.collection, (qb) =>
        qb.where((eb) =>
          eb.exists(
            eb
              .selectFrom("bookToCollection")
              .select(sql.lit(1).as("one"))
              .whereRef("bookToCollection.bookUuid", "=", "book.uuid")
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              .where("bookToCollection.collectionUuid", "=", opts!.collection!),
          ),
        ),
      )
      .$if(!!opts?.series, (qb) =>
        qb.where((eb) =>
          eb.exists(
            eb
              .selectFrom("bookToSeries")
              .select(sql.lit(1).as("one"))
              .whereRef("bookToSeries.bookUuid", "=", "book.uuid")
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              .where("bookToSeries.seriesUuid", "=", opts!.series!),
          ),
        ),
      )
      .$if(opts?.mediaFilter === "ebook", (qb) =>
        qb
          .where((eb) =>
            eb.exists(
              eb
                .selectFrom("ebook")
                .select(sql.lit(1).as("one"))
                .whereRef("ebook.bookUuid", "=", "book.uuid"),
            ),
          )
          .where((eb) =>
            eb.not(
              eb.exists(
                eb
                  .selectFrom("audiobook")
                  .select(sql.lit(1).as("one"))
                  .whereRef("audiobook.bookUuid", "=", "book.uuid"),
              ),
            ),
          ),
      )
      .$if(opts?.mediaFilter === "audiobook", (qb) =>
        qb
          .where((eb) =>
            eb.exists(
              eb
                .selectFrom("audiobook")
                .select(sql.lit(1).as("one"))
                .whereRef("audiobook.bookUuid", "=", "book.uuid"),
            ),
          )
          .where((eb) =>
            eb.not(
              eb.exists(
                eb
                  .selectFrom("ebook")
                  .select(sql.lit(1).as("one"))
                  .whereRef("ebook.bookUuid", "=", "book.uuid"),
              ),
            ),
          ),
      )
      .$if(opts?.mediaFilter === "synced", (qb) =>
        qb.where((eb) =>
          eb.exists(
            eb
              .selectFrom("readaloud")
              .select(sql.lit(1).as("one"))
              .whereRef("readaloud.bookUuid", "=", "book.uuid")
              .where("readaloud.status", "=", "ALIGNED"),
          ),
        ),
      )
      .$if(!!opts?.status && !!userId, (qb) =>
        qb.where((eb) =>
          eb.exists(
            eb
              .selectFrom("bookToStatus")
              .select(sql.lit(1).as("one"))
              .whereRef("bookToStatus.bookUuid", "=", "book.uuid")
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              .where("bookToStatus.statusUuid", "=", opts!.status!)
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              .where("bookToStatus.userId", "=", userId!),
          ),
        ),
      )
      .$if(!!opts?.filter, (qb) =>
        qb.where((eb) =>
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          buildFilterExpression(eb, opts!.filter!, userId),
        ),
      )
  )
}

// count of books matching the same constraints getBooks would list (no
// limit/offset/sort). used for the "showing X of Y" indicator.
export async function countBooks(
  userId?: UUID,
  opts?: GetBooksOptions,
  bookUuids: UUID[] | null = null,
): Promise<number> {
  const row = await applyBookFilters(
    db.selectFrom("book"),
    bookUuids,
    userId,
    opts,
  )
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    .$if(!!userId, (qb) => qb.where((eb) => bookVisibleTo(eb, userId!)))
    .select((eb) => eb.fn.count<number>("book.uuid").distinct().as("count"))
    .executeTakeFirst()

  return row?.count ?? 0
}

export async function getBooks(
  bookUuids: UUID[] | null = null,
  userId?: UUID,
  opts?: GetBooksOptions,
) {
  let query = applyBookFilters(
    booksQuery(userId, opts),
    bookUuids,
    userId,
    opts,
  )
    .$if(!!opts?.limit, (qb) => qb.limit(opts?.limit ?? 10))
    .$if(!!opts?.offset, (qb) => qb.offset(opts?.offset ?? 0))

  const sort: BookSort =
    opts?.sort ??
    (opts?.orderBy
      ? [{ field: opts.orderBy, direction: opts.orderDirection ?? "desc" }]
      : [])

  for (const { field, direction } of sort) {
    query = query.orderBy(
      buildSortExpression(field, { userId, seriesContext: opts?.series }),
      direction,
    )
  }

  // fallback tie-braker sort
  if (sort.length > 0 && sort[sort.length - 1]?.field !== "createdAt") {
    query = query.orderBy(sql`book.created_at`, "desc")
  }

  const rows = await query.execute()

  // the date plugin hands back a Date for iso-shaped columns, but the type (and
  // every consumer, since the api round-trips through json) says string
  return rows.map((row) => ({
    ...row,
    publicationDate: toIsoDateString(row.publicationDate),
  }))
}

export type BookWithRelations = NonNullable<Awaited<ReturnType<typeof getBook>>>

export async function getBook(uuid: UUID, userId?: UUID) {
  const [book] = await getBooks([uuid], userId)
  return book ?? null
}

export async function getBookOrThrow(uuid: UUID) {
  const book = await getBook(uuid)
  if (!book) throw new Error(`No book found with uuid ${uuid}`)
  return book
}

export async function getBookByAudiobookFilepathPrefix(
  audiobookFilepath: string,
) {
  const searchQuery = `${audiobookFilepath.replaceAll(/%/g, "\\%").replaceAll(/_/g, "\\_")}%`

  return await db
    .selectFrom("book")
    .select(["book.uuid", "book.title"])
    .innerJoin("audiobook", "book.uuid", "audiobook.bookUuid")
    .select(["audiobook.filepath as audiobookFilepath"])
    .where(
      sql<boolean>`${sql.ref("audiobook.filepath")} LIKE ${searchQuery} ESCAPE '/'`,
    )
    .executeTakeFirst()
}

export async function deleteBook(
  bookUuid: UUID,
  options?: {
    preventReImport?: boolean
  },
  tr?: Transaction<DB>,
) {
  const preventReImport = options?.preventReImport ?? false

  const callback = async (tr: Transaction<DB>) => {
    // import rules need special handling before the cascade
    if (!preventReImport) {
      await tr
        .deleteFrom("importRule")
        .where("kind", "=", "ignore")
        .where("bookUuid", "=", bookUuid)
        .execute()
    } else {
      // detach existing rules so they survive the cascade (FK is SET NULL)
      await tr
        .updateTable("importRule")
        .set({ source: "prevent-reimport", bookUuid: null })
        .where("kind", "=", "ignore")
        .where("bookUuid", "=", bookUuid)
        .execute()

      // read filepaths before cascade deletes media rows
      const [ebook, audiobook, readaloud] = await Promise.all([
        tr
          .selectFrom("ebook")
          .select("filepath")
          .where("bookUuid", "=", bookUuid)
          .executeTakeFirst(),
        tr
          .selectFrom("audiobook")
          .select("filepath")
          .where("bookUuid", "=", bookUuid)
          .executeTakeFirst(),
        tr
          .selectFrom("readaloud")
          .select("filepath")
          .where("bookUuid", "=", bookUuid)
          .executeTakeFirst(),
      ])

      const externalPaths = [
        ebook?.filepath,
        audiobook?.filepath,
        readaloud?.filepath,
      ].filter((p): p is string => p != null && !pathBelongsTo(ASSETS_DIR, p))

      if (externalPaths.length) {
        await tr
          .insertInto("importRule")
          .values(
            externalPaths.map(
              (path) =>
                ({
                  kind: "ignore",
                  path,
                  source: "prevent-reimport",
                }) as const,
            ),
          )
          .onConflict((oc) => oc.column("path").doNothing())
          .execute()
      }
    }

    // all other relations are deleted by cascade
    await tr.deleteFrom("book").where("uuid", "=", bookUuid).execute()

    // clean up orphaned creators and series
    await Promise.all([
      tr
        .deleteFrom("creator")
        .whereRef("creator.uuid", "not in", (eb) =>
          eb.selectFrom("bookToCreator").select(["creatorUuid"]),
        )
        .execute(),

      tr
        .deleteFrom("series")
        .whereRef("series.uuid", "not in", (eb) =>
          eb.selectFrom("bookToSeries").select(["seriesUuid"]),
        )
        .execute(),
    ])
  }

  if (tr) {
    await callback(tr)
  } else {
    await db.transaction().execute(callback)
  }

  BookEvents.emit("message", {
    type: "bookDeleted",
    bookUuid,
    payload: undefined,
  })
}

/**
 * Drops the row from the format table, returns the filepath that was removed
 * so the caller can decide what to do with the file on disk.
 */
export async function removeBookFormat(
  bookUuid: UUID,
  format: "ebook" | "audiobook" | "readaloud",
): Promise<string | null> {
  const filepath = await db.transaction().execute(async (tr) => {
    let existing: { filepath: string | null } | undefined
    if (format === "ebook") {
      existing = await tr
        .selectFrom("ebook")
        .select("filepath")
        .where("bookUuid", "=", bookUuid)
        .executeTakeFirst()
      if (existing) {
        await tr.deleteFrom("ebook").where("bookUuid", "=", bookUuid).execute()
      }
    } else if (format === "audiobook") {
      existing = await tr
        .selectFrom("audiobook")
        .select("filepath")
        .where("bookUuid", "=", bookUuid)
        .executeTakeFirst()
      if (existing) {
        await tr
          .deleteFrom("audiobook")
          .where("bookUuid", "=", bookUuid)
          .execute()
      }
    } else {
      existing = await tr
        .selectFrom("readaloud")
        .select("filepath")
        .where("bookUuid", "=", bookUuid)
        .executeTakeFirst()
      if (existing) {
        await tr
          .deleteFrom("readaloud")
          .where("bookUuid", "=", bookUuid)
          .execute()
      }
    }
    return existing?.filepath ?? null
  })

  BookEvents.emit("message", {
    type: "bookUpdated",
    bookUuid,
    payload: { [format]: null } as BookUpdatePayload,
  })

  return filepath
}

export type BookRelationsUpdate = {
  creators?: CreatorRelation[]
  series?: SeriesRelation[]
  collections?: UUID[]
  tags?: string[]
  ebook?: EbookRelation
  audiobook?: AudiobookRelation
  readaloud?: ReadaloudRelation
  books?: UUID[]
  status?: StatusRelation
  userBookRating?: UserBookRatingRelation
  identifiers?: IdentifierRelation[]
  extractedIdentifiers?: ExtractedIdentifiers
}

export async function updateBook(
  uuid: UUID,
  update: BookUpdate | null,
  relations: BookRelationsUpdate = {},
  userId?: UUID,
): Promise<BookWithRelations> {
  // capture the prior state when title is about to change so we can move
  // the asset folder afterwards.
  const before =
    update && update.title !== undefined ? await getBook(uuid, userId) : null

  await db.transaction().execute(async (tr) => {
    if (update && Object.keys(update).length) {
      await tr
        .updateTable("book")
        .set(update)
        .where("uuid", "=", uuid)
        .execute()
    }

    if (relations.creators) {
      await tr
        .deleteFrom("bookToCreator")
        .where("bookToCreator.bookUuid", "=", uuid)
        .execute()

      for (const creator of relations.creators) {
        let existing = await tr
          .selectFrom("creator")
          .select(["uuid"])
          .where((eb) =>
            creator.uuid
              ? eb.or([
                  eb("creator.name", "=", creator.name),
                  eb("creator.uuid", "=", creator.uuid),
                ])
              : eb("creator.name", "=", creator.name),
          )
          .executeTakeFirst()

        if (!existing) {
          existing = await tr
            .insertInto("creator")
            .values({
              name: creator.name,
              fileAs: creator.fileAs,
            })
            .returning(["uuid as uuid"])
            .executeTakeFirstOrThrow()
        }

        await tr
          .insertInto("bookToCreator")
          .values({
            creatorUuid: existing.uuid,
            bookUuid: uuid,
            role: creator.role,
          })
          .execute()
      }

      await tr
        .deleteFrom("creator")
        .where("creator.uuid", "not in", (eb) =>
          eb.selectFrom("bookToCreator").select(["bookToCreator.creatorUuid"]),
        )
        .execute()
    }

    if (relations.series) {
      await tr
        .deleteFrom("bookToSeries")
        .where("bookToSeries.bookUuid", "=", uuid)
        .execute()

      for (const series of relations.series) {
        let existing = await tr
          .selectFrom("series")
          .select(["uuid"])
          .where((eb) =>
            series.uuid
              ? eb.or([
                  eb("series.name", "=", series.name),
                  eb("series.uuid", "=", series.uuid),
                ])
              : eb("series.name", "=", series.name),
          )
          .executeTakeFirst()

        if (!existing) {
          existing = await tr
            .insertInto("series")
            .values({
              name: series.name,
              description: series.description,
            })
            .returning(["uuid as uuid"])
            .executeTakeFirstOrThrow()
        }

        if (series.featured) {
          await tr
            .updateTable("bookToSeries")
            .set({ featured: false })
            .where("bookUuid", "=", uuid)
            .execute()
        }

        await tr
          .insertInto("bookToSeries")
          .values({
            seriesUuid: existing.uuid,
            bookUuid: uuid,
            position: series.position,
            featured: series.featured,
          })
          .onConflict((oc) =>
            oc.columns(["bookUuid", "seriesUuid"]).doNothing(),
          )
          .execute()
      }

      await tr
        .deleteFrom("series")
        .where("series.uuid", "not in", (eb) =>
          eb.selectFrom("bookToSeries").select(["bookToSeries.seriesUuid"]),
        )
        .execute()
    }

    if (relations.collections) {
      const collections = relations.collections
      if (collections.length) {
        await tr
          .insertInto("bookToCollection")
          .columns(["bookUuid", "collectionUuid"])
          .expression((eb) =>
            eb
              .selectFrom(() =>
                collections
                  .map((collection) =>
                    tr
                      .selectNoFrom([
                        eb.val(uuid).as("bookUuid"),
                        eb.val(collection).as("collectionUuid"),
                      ])
                      .where((web) =>
                        web.not(
                          web.exists(
                            web
                              .selectFrom("bookToCollection")
                              .select([web.lit(1).as("one")])
                              .where("bookUuid", "=", uuid)
                              .where("collectionUuid", "=", collection),
                          ),
                        ),
                      ),
                  )
                  .reduce((acc, expr) => acc.unionAll(expr))
                  .as("values"),
              )
              .selectAll(),
          )
          .execute()
      }

      await tr
        .deleteFrom("bookToCollection")
        .where("bookUuid", "=", uuid)
        .where("collectionUuid", "not in", relations.collections)
        .execute()
    }

    if (relations.tags) {
      const tags = relations.tags
      if (tags.length) {
        await tr
          .insertInto("tag")
          .columns(["name"])
          .expression((eb) =>
            eb
              .selectFrom(() =>
                tags
                  .map((tag) =>
                    tr.selectNoFrom([eb.val(tag).as("name")]).where((web) =>
                      web.not(
                        web.exists(
                          web
                            .selectFrom("tag")
                            .select([web.lit(1).as("one")])
                            .where("tag.name", "=", tag),
                        ),
                      ),
                    ),
                  )
                  .reduce((acc, expr) => acc.unionAll(expr))
                  .as("values"),
              )
              .selectAll(),
          )
          .execute()

        await tr
          .insertInto("bookToTag")
          .columns(["bookUuid", "tagUuid"])
          .expression((eb) =>
            eb
              .selectFrom(() =>
                tags
                  .map((tag) =>
                    eb
                      .selectFrom("tag")
                      .select([
                        eb.val(uuid).as("bookUuid"),
                        "tag.uuid as tagUuid",
                      ])
                      .where("tag.name", "=", tag)
                      .where((web) =>
                        web.not(
                          web.exists(
                            web
                              .selectFrom("bookToTag")
                              .select([web.lit(1).as("one")])
                              .innerJoin("tag", "tag.uuid", "tagUuid")
                              .where("bookUuid", "=", uuid)
                              .where("tag.name", "=", tag),
                          ),
                        ),
                      ),
                  )
                  .reduce((acc, expr) => acc.unionAll(expr))
                  .as("values"),
              )
              .selectAll(),
          )
          .execute()
      }

      await tr
        .deleteFrom("bookToTag")
        .where("bookUuid", "=", uuid)
        .where((web) =>
          web(
            "tagUuid",
            "not in",
            web
              .selectFrom("tag")
              .select(["uuid"])
              .where("tag.name", "in", tags),
          ),
        )
        .execute()

      await tr
        .deleteFrom("tag")
        .where("tag.uuid", "not in", (eb) =>
          eb.selectFrom("bookToTag").select(["bookToTag.tagUuid"]),
        )
        .execute()
    }

    if (relations.userBookRating !== undefined) {
      if (
        relations.userBookRating.rating == null &&
        relations.userBookRating.review == null
      ) {
        // delete the rating
        await tr
          .deleteFrom("userBookRating")
          .where("bookUuid", "=", uuid)
          .where("userId", "=", relations.userBookRating.userId)
          .execute()
      } else {
        await tr
          .insertInto("userBookRating")
          .values({ ...relations.userBookRating, bookUuid: uuid })
          .onConflict((oc) =>
            oc.columns(["userId", "bookUuid"]).doUpdateSet({
              rating: relations.userBookRating?.rating,
              review: relations.userBookRating?.review,
            }),
          )
          .execute()
      }
    }

    if (relations.identifiers) {
      await tr
        .deleteFrom("identifier")
        .where("identifier.bookUuid", "=", uuid)
        .execute()

      if (relations.identifiers.length) {
        await tr
          .insertInto("identifier")
          .values(
            relations.identifiers.map((identifier) => ({
              ...identifier,
              bookUuid: uuid,
            })),
          )
          .execute()
      }
    }

    if (relations.ebook) {
      const existing = await tr
        .selectFrom("ebook")
        .select(["uuid"])
        .where("bookUuid", "=", uuid)
        .executeTakeFirst()

      if (existing) {
        await tr
          .updateTable("ebook")
          .set(relations.ebook)
          .where("uuid", "=", existing.uuid)
          .execute()
      } else {
        await tr
          .insertInto("ebook")
          .values({ bookUuid: uuid, ...relations.ebook })
          .execute()
      }
    }

    if (relations.audiobook) {
      const existing = await tr
        .selectFrom("audiobook")
        .select(["uuid"])
        .where("bookUuid", "=", uuid)
        .executeTakeFirst()

      if (existing) {
        await tr
          .updateTable("audiobook")
          .set(relations.audiobook)
          .where("uuid", "=", existing.uuid)
          .execute()
      } else {
        await tr
          .insertInto("audiobook")
          .values({ bookUuid: uuid, ...relations.audiobook })
          .execute()
      }
    }

    if (relations.readaloud) {
      const existing = await tr
        .selectFrom("readaloud")
        .select(["uuid"])
        .where("bookUuid", "=", uuid)
        .executeTakeFirst()

      if (existing) {
        await tr
          .updateTable("readaloud")
          .set(relations.readaloud)
          .where("uuid", "=", existing.uuid)
          .execute()
      } else {
        await tr
          .insertInto("readaloud")
          .values({ bookUuid: uuid, ...relations.readaloud })
          .execute()
      }
    }

    // link identifiers extracted from the file after we are sure the format rows are upserted
    if (relations.extractedIdentifiers) {
      await linkExtractedIdentifiers(tr, uuid, relations.extractedIdentifiers)
    }

    if (relations.books) {
      await tr
        .updateTable("ebook")
        .set({ bookUuid: uuid })
        .where("bookUuid", "in", relations.books)
        .execute()

      await tr
        .updateTable("audiobook")
        .set({ bookUuid: uuid })
        .where("bookUuid", "in", relations.books)
        .execute()

      await tr
        .updateTable("readaloud")
        .set({ bookUuid: uuid })
        .where("bookUuid", "in", relations.books)
        .execute()

      const allBookUuids = [uuid, ...relations.books]

      // find the most recent position per user
      const keptPositions = await tr
        .selectFrom("position")
        .select((eb) => [
          "userId",
          "locator",
          eb.fn.max("timestamp").as("timestamp"),
        ])
        .where("bookUuid", "in", allBookUuids)
        .groupBy("userId")
        .execute()

      // insert the most recent position per user onto the target book
      // the position of the merged books will be deleted through cascade
      for (const pos of keptPositions) {
        const values = {
          userId: pos.userId,
          bookUuid: uuid,
          locator: JSON.stringify(pos.locator),
          timestamp: pos.timestamp,
        }

        await tr
          .insertInto("position")
          .values(values)
          .onConflict((oc) =>
            oc.columns(["userId", "bookUuid"]).doUpdateSet(values),
          )
          .execute()
      }

      // copy the import rules to the target book
      await tr
        .updateTable("importRule")
        .set({ bookUuid: uuid })
        .where("bookUuid", "in", relations.books)
        .execute()

      // other positions will get cleaned up by cascade
      for (const bookUuid of relations.books) {
        await deleteBook(bookUuid, undefined, tr)
      }
    }

    if (relations.status) {
      await tr
        .updateTable("bookToStatus")
        .set({ statusUuid: relations.status.statusUuid })
        .where("userId", "=", relations.status.userId)
        .where("bookUuid", "=", uuid)
        .execute()
    }
  })

  let book = await getBook(uuid, userId)

  if (!book) throw new Error(`Failed to retrieve book with uuid ${uuid}`)

  // move the asset folder when title actually changed
  if (before && before.title !== book.title) {
    const { renameBookAssets } = await import("@/assets/fs")
    book = await renameBookAssets(before, book)
  }

  BookEvents.emit("message", {
    type: "bookUpdated",
    bookUuid: uuid,
    payload: book,
  })
  // these are books that are being merged into the target book
  if (relations.books) {
    for (const bookUuid of relations.books) {
      BookEvents.emit("message", {
        type: "bookDeleted",
        bookUuid: bookUuid,
        payload: undefined,
      })
    }
  }

  return book
}

export async function touchBook(uuid: UUID, userId?: UUID) {
  await db
    .updateTable("book")
    .set({ updatedAt: sql`CURRENT_TIMESTAMP` })
    .where("uuid", "=", uuid)
    .execute()

  const book = await getBook(uuid, userId)

  if (!book) throw new Error(`Failed to retrieve book with uuid ${uuid}`)

  BookEvents.emit("message", {
    type: "bookUpdated",
    bookUuid: uuid,
    payload: book,
  })

  return book
}

export type BookFormat = "ebook" | "audiobook" | "readaloud"

/**
 * persist the blurhash + dominant colors derived from a freshly uploaded cover.
 * called after persistCover so the placeholder + theme reflect the new art
 * instead of the old one.
 */

/**
 * marks a format as missing in the database when we discover at runtime
 * that the underlying file no longer exists on disk.
 */
export async function markFormatMissing(
  uuid: UUID,
  format: BookFormat,
): Promise<void> {
  switch (format) {
    case "ebook":
      await db
        .updateTable("ebook")
        .set({ missing: true })
        .where("bookUuid", "=", uuid)
        .execute()
      break
    case "audiobook":
      await db
        .updateTable("audiobook")
        .set({ missing: true })
        .where("bookUuid", "=", uuid)
        .execute()
      break
    case "readaloud":
      await db
        .updateTable("readaloud")
        .set({ missing: true })
        .where("bookUuid", "=", uuid)
        .execute()
      break
  }

  const book = await getBook(uuid)
  if (book) {
    BookEvents.emit("message", {
      type: "bookUpdated",
      bookUuid: uuid,
      payload: book,
    })
  }
}

// the distinct non-empty stored values of a distinct-facet book column
// (language, transcription engine, ...), for filter option lists.
export async function getDistinctBookFieldValues(
  field: DistinctFacetField,
): Promise<string[]> {
  const rows = await db
    .selectFrom("book")
    .select(field)
    .distinct()
    .where(field, "is not", null)
    .where(field, "!=", "")
    .orderBy(field)
    .execute()

  return rows
    .map((row) => row[field])
    .filter((value): value is string => !!value)
}
