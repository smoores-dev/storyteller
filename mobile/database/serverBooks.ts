import { type Insertable, sql } from "kysely"

import { type BookWithRelations as ServerBook } from "@storyteller-platform/web/src/database/books"

import { type ReadiumLocator } from "@/modules/readium/src/Readium.types"
import { type UUID, randomUUID } from "@/uuid"

import {
  type NewAudiobook,
  type NewBook,
  type NewBookToCollection,
  type NewBookToCreator,
  type NewBookToSeries,
  type NewBookToStatus,
  type NewBookToTag,
  type NewEbook,
  type NewReadaloud,
  getBook,
} from "./books"
import { type CollectionUpdate, type NewCollection } from "./collections"
import { type NewCreator } from "./creators"
import { db } from "./db"
import { type NewPosition } from "./positions"
import { type DB } from "./schema"
import { type NewSeries } from "./series"
import { type NewTag } from "./tags"

export async function upsertServerBooks(
  serverBooks: ServerBook[],
  serverUuid: UUID,
  isReadaloudDownloaded?: boolean,
) {
  if (!serverBooks.length) return

  await db.transaction().execute(async (tr) => {
    const existingCreators = await tr
      .selectFrom("creator")
      .select(["uuid", "name"])
      .where("serverUuid", "=", serverUuid)
      .execute()

    const existingCreatorMap = new Map(
      existingCreators.map((c) => [c.name, c.uuid]),
    )

    const existingSeries = await tr
      .selectFrom("series")
      .select(["uuid", "name"])
      .where("serverUuid", "=", serverUuid)
      .execute()

    const existingSeriesMap = new Map(
      existingSeries.map((s) => [s.name, s.uuid]),
    )

    const existingCollections = await tr
      .selectFrom("collection")
      .select(["uuid", "name"])
      .where("serverUuid", "=", serverUuid)
      .execute()

    const existingCollectionMap = new Map(
      existingCollections.map((c) => [c.name, c.uuid]),
    )

    const existingTags = await tr
      .selectFrom("tag")
      .select(["uuid", "name"])
      .where("serverUuid", "=", serverUuid)
      .execute()

    const existingTagMap = new Map(existingTags.map((t) => [t.name, t.uuid]))

    const statuses = await tr
      .selectFrom("status")
      .select(["uuid", "name", "isDefault"])
      .execute()

    const existingPositions = await tr
      .selectFrom("position")
      .select(["timestamp", "bookUuid"])
      .execute()

    const existingPositionMap = new Map(
      existingPositions.map((p) => [p.bookUuid, p.timestamp]),
    )

    const statusMap = new Map(statuses.map((s) => [s.name, s.uuid]))
    const defaultStatus = statuses.find((s) => s.isDefault)!

    const booksToInsert: NewBook[] = []
    const bookToStatusRecords: NewBookToStatus[] = []
    const positionsToInsert: NewPosition[] = []
    const ebooksToInsert: NewEbook[] = []
    const audiobooksToInsert: NewAudiobook[] = []
    const readaloudsToInsert: NewReadaloud[] = []
    const creatorsToInsert: NewCreator[] = []
    const bookToCreatorRecords: NewBookToCreator[] = []
    const seriesToInsert: NewSeries[] = []
    const bookToSeriesRecords: NewBookToSeries[] = []
    const collectionsToInsert: NewCollection[] = []
    const seenCollectionsToUpdate = new Set<UUID>()
    const collectionsToUpdate: CollectionUpdate[] = []
    const bookToCollectionRecords: NewBookToCollection[] = []
    const tagsToInsert: NewTag[] = []
    const bookToTagRecords: NewBookToTag[] = []

    for (const serverBook of serverBooks) {
      const statusName = serverBook.status?.name ?? "To read"
      const statusUuid = statusMap.get(statusName) ?? defaultStatus.uuid

      booksToInsert.push({
        uuid: serverBook.uuid,
        id: serverBook.id,
        title: serverBook.title,
        subtitle: serverBook.subtitle,
        serverUuid: serverUuid,
        description: serverBook.description,
        publicationDate: serverBook.publicationDate,
        rating: serverBook.rating,
        language: serverBook.language,
        alignedAt: serverBook.alignedAt,
        alignedByStorytellerVersion: serverBook.alignedByStorytellerVersion,
        alignedWith: serverBook.alignedWith,
        createdAt: serverBook.createdAt,
      })

      bookToStatusRecords.push({
        uuid: randomUUID(),
        bookUuid: serverBook.uuid,
        statusUuid: statusUuid,
      })

      if (serverBook.position) {
        const existingPositionTimestamp = existingPositionMap.get(
          serverBook.uuid,
        )
        if (
          !existingPositionTimestamp ||
          serverBook.position.timestamp > existingPositionTimestamp
        ) {
          positionsToInsert.push({
            uuid: serverBook.position.uuid,
            bookUuid: serverBook.uuid,
            locator: JSON.stringify(serverBook.position.locator),
            timestamp: serverBook.position.timestamp,
          })
        }
      }

      if (serverBook.ebook) {
        ebooksToInsert.push({
          uuid: serverBook.ebook.uuid,
          bookUuid: serverBook.uuid,
        })
      }

      if (serverBook.audiobook) {
        audiobooksToInsert.push({
          uuid: serverBook.audiobook.uuid,
          bookUuid: serverBook.uuid,
        })
      }

      if (serverBook.readaloud) {
        readaloudsToInsert.push({
          uuid: serverBook.readaloud.uuid,
          bookUuid: serverBook.uuid,
          status: serverBook.readaloud.status,
          ...(isReadaloudDownloaded && { downloadStatus: "DOWNLOADED" }),
        })
      }

      const allCreators = [
        ...serverBook.authors.map((a) => ({ ...a, role: "aut" as const })),
        ...serverBook.narrators.map((n) => ({ ...n, role: "nrt" as const })),
        ...serverBook.creators,
      ]

      for (const creator of allCreators) {
        const existingUuid = existingCreatorMap.get(creator.name)

        if (existingUuid) {
          bookToCreatorRecords.push({
            uuid: randomUUID(),
            bookUuid: serverBook.uuid,
            creatorUuid: existingUuid,
            role: creator.role,
          })
        } else {
          creatorsToInsert.push({
            uuid: creator.uuid,
            name: creator.name,
            fileAs: creator.fileAs,
            serverUuid,
          })

          existingCreatorMap.set(creator.name, creator.uuid)

          bookToCreatorRecords.push({
            uuid: randomUUID(),
            bookUuid: serverBook.uuid,
            creatorUuid: creator.uuid,
            role: creator.role,
          })
        }
      }

      for (const series of serverBook.series) {
        const existingUuid = existingSeriesMap.get(series.name)

        if (existingUuid) {
          bookToSeriesRecords.push({
            uuid: randomUUID(),
            bookUuid: serverBook.uuid,
            seriesUuid: existingUuid,
            featured: series.featured ? "true" : "false",
            position: series.position,
          })
        } else {
          seriesToInsert.push({
            uuid: series.uuid,
            name: series.name,
            serverUuid,
          })

          existingSeriesMap.set(series.name, series.uuid)

          bookToSeriesRecords.push({
            uuid: randomUUID(),
            bookUuid: serverBook.uuid,
            seriesUuid: series.uuid,
            featured: series.featured ? "true" : "false",
            position: series.position,
          })
        }
      }

      for (const collection of serverBook.collections) {
        const existingUuid = existingCollectionMap.get(collection.name)

        if (existingUuid) {
          if (!seenCollectionsToUpdate.has(existingUuid)) {
            seenCollectionsToUpdate.add(existingUuid)
            collectionsToUpdate.push({
              uuid: existingUuid,
              description: collection.description,
              public: collection.public ? "true" : "false",
            })
          }
          bookToCollectionRecords.push({
            uuid: randomUUID(),
            bookUuid: serverBook.uuid,
            collectionUuid: existingUuid,
          })
        } else {
          collectionsToInsert.push({
            uuid: collection.uuid,
            name: collection.name,
            description: collection.description,
            public: collection.public ? "true" : "false",
            serverUuid,
          })

          existingCollectionMap.set(collection.name, collection.uuid)

          bookToCollectionRecords.push({
            uuid: randomUUID(),
            bookUuid: serverBook.uuid,
            collectionUuid: collection.uuid,
          })
        }
      }

      for (const tag of serverBook.tags) {
        const existingUuid = existingTagMap.get(tag.name)

        if (existingUuid) {
          bookToTagRecords.push({
            uuid: randomUUID(),
            bookUuid: serverBook.uuid,
            tagUuid: existingUuid,
          })
        } else {
          tagsToInsert.push({
            uuid: tag.uuid,
            name: tag.name,
            serverUuid,
          })

          existingTagMap.set(tag.name, tag.uuid)

          bookToTagRecords.push({
            uuid: randomUUID(),
            bookUuid: serverBook.uuid,
            tagUuid: tag.uuid,
          })
        }
      }
    }

    if (creatorsToInsert.length > 0) {
      const chunks = partitionByLength(creatorsToInsert, 50)
      for (const chunk of chunks) {
        await tr
          .insertInto("creator")
          .values(chunk)
          .onConflict((oc) =>
            oc.column("uuid").doUpdateSet((eb) => ({
              name: eb.ref("excluded.name"),
            })),
          )
          .execute()
      }
    }

    if (seriesToInsert.length > 0) {
      const chunks = partitionByLength(seriesToInsert, 50)
      for (const chunk of chunks) {
        await tr
          .insertInto("series")
          .values(chunk)
          .onConflict((oc) =>
            oc.column("uuid").doUpdateSet((eb) => ({
              name: eb.ref("excluded.name"),
            })),
          )
          .execute()
      }
    }

    if (collectionsToUpdate.length) {
      const chunks = partitionByLength(collectionsToUpdate, 50)
      for (const chunk of chunks) {
        await tr
          .updateTable("collection")
          .from(
            chunk
              .slice(1)
              .reduce(
                (qb, { uuid, description, public: isPublic }) =>
                  qb.union(
                    tr.selectNoFrom([
                      sql<UUID>`${uuid}`.as("uuid"),
                      sql<string>`${description}`.as("description"),
                      sql<"true" | "false">`${isPublic ? "true" : "false"}`.as(
                        "public",
                      ),
                    ]),
                  ),
                tr.selectNoFrom([
                  sql<UUID>`${chunk[0]?.uuid}`.as("uuid"),
                  sql<string>`${chunk[0]?.description}`.as("description"),
                  sql<
                    "true" | "false"
                  >`${chunk[0]?.public ? "true" : "false"}`.as("public"),
                ]),
              )
              .as("data"),
          )
          .set((eb) => ({
            description: eb.ref("data.description"),
            public: eb.ref("data.public"),
          }))
          .whereRef("collection.uuid", "=", "data.uuid")
          .execute()
      }
    }

    if (collectionsToInsert.length > 0) {
      const chunks = partitionByLength(collectionsToInsert, 50)
      for (const chunk of chunks) {
        await tr
          .insertInto("collection")
          .values(chunk)
          .onConflict((oc) =>
            oc.column("uuid").doUpdateSet((eb) => ({
              name: eb.ref("excluded.name"),
              public: eb.ref("excluded.public"),
              description: eb.ref("excluded.description"),
            })),
          )
          .execute()
      }
    }

    if (tagsToInsert.length > 0) {
      const chunks = partitionByLength(tagsToInsert, 50)
      for (const chunk of chunks) {
        await tr.insertInto("tag").values(chunk).execute()
      }
    }

    const bookChunks = partitionByLength(booksToInsert, 50)
    for (const chunk of bookChunks) {
      await tr
        .insertInto("book")
        .values(chunk)
        .onConflict((oc) =>
          oc.column("uuid").doUpdateSet((eb) => ({
            id: eb.ref("excluded.id"),
            title: eb.ref("excluded.title"),
            subtitle: eb.ref("excluded.subtitle"),
            serverUuid: serverUuid,
            description: eb.ref("excluded.description"),
            publicationDate: eb.ref("excluded.publicationDate"),
            rating: eb.ref("excluded.rating"),
            language: eb.ref("excluded.language"),
            alignedAt: eb.ref("excluded.alignedAt"),
            alignedByStorytellerVersion: eb.ref(
              "excluded.alignedByStorytellerVersion",
            ),
            alignedWith: eb.ref("excluded.alignedWith"),
            createdAt: eb.ref("excluded.createdAt"),
            ebookCoverUrl: null,
            audiobookCoverUrl: null,
          })),
        )
        .execute()
    }

    if (bookToStatusRecords.length > 0) {
      const chunks = partitionByLength(bookToStatusRecords, 50)
      for (const chunk of chunks) {
        await tr
          .insertInto("bookToStatus")
          .values(chunk)
          .onConflict((oc) =>
            oc.column("bookUuid").doUpdateSet((eb) => ({
              dirty: "false",
              statusUuid: eb.ref("excluded.statusUuid"),
            })),
          )
          .execute()
      }
    }

    if (positionsToInsert.length > 0) {
      const chunks = partitionByLength(positionsToInsert, 50)
      for (const chunk of chunks) {
        await tr
          .insertInto("position")
          .values(chunk as unknown as Insertable<DB["position"]>[])
          .onConflict((oc) =>
            oc.column("bookUuid").doUpdateSet((eb) => ({
              locator: eb.ref("excluded.locator"),
              timestamp: eb.ref("excluded.timestamp"),
            })),
          )
          .execute()
      }
    }

    if (ebooksToInsert.length > 0) {
      const chunks = partitionByLength(ebooksToInsert, 50)
      for (const chunk of chunks) {
        await tr
          .insertInto("ebook")
          .values(chunk as unknown as Insertable<DB["ebook"]>[])
          .onConflict((oc) => oc.column("bookUuid").doNothing())
          .execute()
      }
    }

    if (audiobooksToInsert.length > 0) {
      const chunks = partitionByLength(audiobooksToInsert, 50)
      for (const chunk of chunks) {
        await tr
          .insertInto("audiobook")
          .values(chunk as unknown as Insertable<DB["audiobook"]>[])
          .onConflict((oc) => oc.column("bookUuid").doNothing())
          .execute()
      }
    }

    if (readaloudsToInsert.length > 0) {
      const chunks = partitionByLength(readaloudsToInsert, 50)
      for (const chunk of chunks) {
        await tr
          .insertInto("readaloud")
          .values(chunk as unknown as Insertable<DB["readaloud"]>)
          .onConflict((oc) =>
            oc.column("bookUuid").doUpdateSet((eb) => ({
              status: eb.ref("excluded.status"),
            })),
          )
          .execute()
      }
    }

    if (bookToCreatorRecords.length > 0) {
      const chunks = partitionByLength(bookToCreatorRecords, 50)
      for (const chunk of chunks) {
        await tr
          .insertInto("bookToCreator")
          .values(chunk)
          .onConflict((oc) =>
            oc
              .column("bookUuid")
              .column("creatorUuid")
              .doUpdateSet((eb) => ({
                role: eb.ref("excluded.role"),
              })),
          )
          .execute()
      }
    }

    if (bookToSeriesRecords.length > 0) {
      const chunks = partitionByLength(bookToSeriesRecords, 50)
      for (const chunk of chunks) {
        await tr
          .insertInto("bookToSeries")
          .values(chunk)
          .onConflict((oc) =>
            oc
              .column("bookUuid")
              .column("seriesUuid")
              .doUpdateSet((eb) => ({
                featured: eb.ref("excluded.featured"),
                position: eb.ref("excluded.position"),
              })),
          )
          .execute()
      }
    }

    if (bookToCollectionRecords.length > 0) {
      const chunks = partitionByLength(bookToCollectionRecords, 50)
      for (const chunk of chunks) {
        await tr
          .insertInto("bookToCollection")
          .values(chunk)
          .onConflict((oc) =>
            oc.column("bookUuid").column("collectionUuid").doNothing(),
          )
          .execute()
      }
    }

    if (bookToTagRecords.length > 0) {
      const chunks = partitionByLength(bookToTagRecords, 50)
      for (const chunk of chunks) {
        await tr
          .insertInto("bookToTag")
          .values(chunk)
          .onConflict((oc) =>
            oc.column("bookUuid").column("tagUuid").doNothing(),
          )
          .execute()
      }
    }
  })
}

function partitionByLength<T>(input: T[], length: number): [T[], ...T[][]] {
  return input.reduce(
    (acc, element) => {
      const prev = acc[acc.length - 1]!
      if (prev.length < length) {
        prev.push(element)
        return acc
      }
      acc.push([element])
      return acc
    },
    [[]] as [T[], ...T[][]],
  )
}

export async function createBookFromServer(
  serverUuid: UUID,
  serverBook: ServerBook,
  isReadaloudDownloaded?: boolean,
) {
  await db.transaction().execute(async (tr) => {
    const status =
      (await tr
        .selectFrom("status")
        .select("uuid")
        .where("name", "=", serverBook.status?.name ?? "To read")
        .executeTakeFirst()) ??
      (await tr
        .selectFrom("status")
        .select("uuid")
        .where("isDefault", "=", "true")
        .executeTakeFirstOrThrow())

    await tr
      .insertInto("book")
      .values({
        uuid: serverBook.uuid,
        id: serverBook.id,
        title: serverBook.title,
        subtitle: serverBook.subtitle,
        serverUuid: serverUuid,
        description: serverBook.description,
        publicationDate: serverBook.publicationDate,
        rating: serverBook.rating,
        language: serverBook.language,
        alignedAt: serverBook.alignedAt,
        alignedByStorytellerVersion: serverBook.alignedByStorytellerVersion,
        alignedWith: serverBook.alignedWith,
        createdAt: serverBook.createdAt,
      })
      .execute()

    await tr
      .insertInto("bookToStatus")
      .values({
        uuid: randomUUID(),
        bookUuid: serverBook.uuid,
        statusUuid: status.uuid,
      })
      .execute()

    if (serverBook.position) {
      await tr
        .insertInto("position")
        .values({
          uuid: serverBook.position.uuid,
          bookUuid: serverBook.uuid,
          locator: JSON.stringify(
            serverBook.position.locator,
          ) as unknown as ReadiumLocator,
          timestamp: serverBook.position.timestamp,
        })
        .execute()
    }

    if (serverBook.ebook) {
      await tr
        .insertInto("ebook")
        .values({ uuid: serverBook.ebook.uuid, bookUuid: serverBook.uuid })
        .execute()
    }

    if (serverBook.audiobook) {
      await tr
        .insertInto("audiobook")
        .values({ uuid: serverBook.audiobook.uuid, bookUuid: serverBook.uuid })
        .execute()
    }

    if (serverBook.readaloud) {
      await tr
        .insertInto("readaloud")
        .values({
          uuid: serverBook.readaloud.uuid,
          bookUuid: serverBook.uuid,
          status: serverBook.readaloud.status,
          ...(isReadaloudDownloaded && { downloadStatus: "DOWNLOADED" }),
        })
        .execute()
    }

    for (const creator of [
      ...serverBook.authors,
      ...serverBook.narrators,
      ...serverBook.creators,
    ]) {
      const existing = await tr
        .selectFrom("creator")
        .select("uuid")
        .where("name", "=", creator.name)
        .where("serverUuid", "=", serverUuid)
        .executeTakeFirst()

      if (existing) {
        const bookToCreators = await tr
          .selectFrom("bookToCreator")
          .selectAll()
          .where("creatorUuid", "=", existing.uuid)
          .execute()
        await tr
          .deleteFrom("bookToCreator")
          .where("creatorUuid", "=", existing.uuid)
          .execute()

        await tr
          .updateTable("creator")
          .set({
            uuid: creator.uuid,
            fileAs: creator.fileAs,
          })
          .where("uuid", "=", existing.uuid)
          .execute()

        for (const bookToCreator of bookToCreators) {
          await tr
            .insertInto("bookToCreator")
            .values({
              ...bookToCreator,
              creatorUuid: creator.uuid,
            })
            .execute()
        }
      } else {
        await tr
          .insertInto("creator")
          .values({
            uuid: creator.uuid,
            name: creator.name,
            fileAs: creator.fileAs,
            serverUuid,
          })
          .execute()
      }
    }

    for (const author of serverBook.authors) {
      await tr
        .insertInto("bookToCreator")
        .values({
          uuid: randomUUID(),
          bookUuid: serverBook.uuid,
          creatorUuid: author.uuid,
          role: "aut",
        })
        .execute()
    }

    for (const narrator of serverBook.narrators) {
      await tr
        .insertInto("bookToCreator")
        .values({
          uuid: randomUUID(),
          bookUuid: serverBook.uuid,
          creatorUuid: narrator.uuid,
          role: "nrt",
        })
        .execute()
    }

    for (const creator of serverBook.creators) {
      await tr
        .insertInto("bookToCreator")
        .values({
          uuid: randomUUID(),
          bookUuid: serverBook.uuid,
          creatorUuid: creator.uuid,
          role: creator.role,
        })
        .execute()
    }

    for (const series of serverBook.series) {
      const existing = await tr
        .selectFrom("series")
        .select("uuid")
        .where("name", "=", series.name)
        .where("serverUuid", "=", serverUuid)
        .executeTakeFirst()

      if (existing) {
        await tr
          .updateTable("series")
          .set({
            uuid: series.uuid,
          })
          .where("uuid", "=", existing.uuid)
          .execute()
      } else {
        await tr
          .insertInto("series")
          .values({
            uuid: series.uuid,
            name: series.name,
            serverUuid,
          })
          .execute()
      }

      await tr
        .insertInto("bookToSeries")
        .values({
          uuid: randomUUID(),
          bookUuid: serverBook.uuid,
          seriesUuid: series.uuid,
          featured: series.featured ? "true" : "false",
          position: series.position,
        })
        .execute()
    }

    for (const collection of serverBook.collections) {
      const existing = await tr
        .selectFrom("collection")
        .select("uuid")
        .where("name", "=", collection.name)
        .where("serverUuid", "=", serverUuid)
        .executeTakeFirst()

      if (existing) {
        await tr
          .updateTable("collection")
          .set({
            uuid: collection.uuid,
            description: collection.description,
            public: collection.public ? "true" : "false",
          })
          .where("uuid", "=", existing.uuid)
          .execute()
      } else {
        await tr
          .insertInto("collection")
          .values({
            uuid: collection.uuid,
            name: collection.name,
            description: collection.description,
            public: collection.public ? "true" : "false",
            serverUuid,
          })
          .execute()
      }

      await tr
        .insertInto("bookToCollection")
        .values({
          uuid: randomUUID(),
          bookUuid: serverBook.uuid,
          collectionUuid: collection.uuid,
        })
        .execute()
    }

    for (const tag of serverBook.tags) {
      const existing = await tr
        .selectFrom("tag")
        .select("uuid")
        .where("name", "=", tag.name)
        .where("serverUuid", "=", serverUuid)
        .executeTakeFirst()

      if (existing) {
        await tr
          .updateTable("tag")
          .set({
            uuid: tag.uuid,
          })
          .where("uuid", "=", existing.uuid)
          .execute()
      } else {
        await tr
          .insertInto("tag")
          .values({
            uuid: tag.uuid,
            name: tag.name,
            serverUuid,
          })
          .execute()
      }

      await tr
        .insertInto("bookToTag")
        .values({
          uuid: randomUUID(),
          bookUuid: serverBook.uuid,
          tagUuid: tag.uuid,
        })
        .execute()
    }
  })

  return await getBook(serverBook.uuid)
}

export async function trimDeletedServerBooks(
  serverBooks: ServerBook[],
  serverUuid: UUID,
) {
  const allCreatorUuids = Array.from(
    new Set(
      serverBooks.flatMap((book) => [
        ...book.creators.map((creator) => creator.uuid),
        ...book.authors.map((author) => author.uuid),
        ...book.narrators.map((narrator) => narrator.uuid),
      ]),
    ),
  )
  const allSeriesUuids = Array.from(
    new Set(
      serverBooks.flatMap((book) => book.series.map((series) => series.uuid)),
    ),
  )
  const allCollectionUuids = Array.from(
    new Set(
      serverBooks.flatMap((book) =>
        book.collections.map((collection) => collection.uuid),
      ),
    ),
  )
  const allTagUuids = Array.from(
    new Set(serverBooks.flatMap((book) => book.tags.map((tag) => tag.uuid))),
  )

  await db.transaction().execute(async (tr) => {
    await tr
      .deleteFrom("creator")
      .where("uuid", "not in", allCreatorUuids)
      .where("serverUuid", "=", serverUuid)
      .execute()
    await tr
      .deleteFrom("series")
      .where("uuid", "not in", allSeriesUuids)
      .where("serverUuid", "=", serverUuid)
      .execute()
    await tr
      .deleteFrom("collection")
      .where("uuid", "not in", allCollectionUuids)
      .where("serverUuid", "=", serverUuid)
      .execute()
    await tr
      .deleteFrom("tag")
      .where("uuid", "not in", allTagUuids)
      .where("serverUuid", "=", serverUuid)
      .execute()
  })
}
