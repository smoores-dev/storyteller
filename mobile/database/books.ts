import { Image } from "expo-image"
import { type Insertable, type Transaction, type Updateable, sql } from "kysely"
import { jsonArrayFrom, jsonObjectFrom } from "kysely/helpers/sqlite"

import { getCoverUrl } from "@/store/serverApi"
import { type UUID, randomUUID } from "@/uuid"

import { type NewCreator } from "./creators"
import { db } from "./db"
import { type NewPosition } from "./positions"
import { type DB } from "./schema"
import { type NewSeries } from "./series"
import { type Server } from "./servers"
import { type NewTag } from "./tags"

export type NewBook = Insertable<DB["book"]>
export type NewBookToStatus = Insertable<DB["bookToStatus"]>
export type NewEbook = Insertable<DB["ebook"]>
export type NewAudiobook = Insertable<DB["audiobook"]>
export type NewReadaloud = Insertable<DB["readaloud"]>

export type NewBookToCreator = Insertable<DB["bookToCreator"]>
export type NewBookToSeries = Insertable<DB["bookToSeries"]>
export type NewBookToCollection = Insertable<DB["bookToCollection"]>
export type NewBookToTag = Insertable<DB["bookToTag"]>

export type BookWithRelations = Awaited<ReturnType<typeof getBooks>>[number]
export type EbookUpdate = Updateable<DB["ebook"]>
export type AudiobookUpdate = Updateable<DB["audiobook"]>
export type ReadaloudUpdate = Updateable<DB["readaloud"]>

export type BookUpdate = Updateable<DB["book"]>

export async function createBook(
  book: NewBook,
  relations?: {
    status?: UUID
    readaloud?: Omit<NewReadaloud, "bookUuid">
    ebook?: Omit<NewEbook, "bookUuid">
    creators?: (NewCreator &
      Omit<NewBookToCreator, "bookUuid" | "creatorUuid">)[]
    series?: (NewSeries & Omit<NewBookToSeries, "bookUuid" | "seriesUuid">)[]
    tags?: NewTag[]
    position?: Omit<NewPosition, "bookUuid">
  },
) {
  await db.insertInto("book").values(book).execute()

  if (relations?.status) {
    await db
      .insertInto("bookToStatus")
      .values({
        uuid: randomUUID(),
        bookUuid: book.uuid,
        statusUuid: relations.status,
      })
      .execute()
  }

  if (relations?.readaloud) {
    await db
      .insertInto("readaloud")
      .values({ ...relations.readaloud, bookUuid: book.uuid })
      .execute()
  }

  if (relations?.ebook) {
    await db
      .insertInto("ebook")
      .values({ ...relations.ebook, bookUuid: book.uuid })
      .execute()
  }

  if (relations?.creators?.length) {
    await db
      .insertInto("creator")
      .values(
        relations.creators.map((creator) => ({
          uuid: creator.uuid,
          name: creator.name,
          fileAs: creator.fileAs,
        })),
      )
      .execute()

    const creators = await db
      .selectFrom("creator")
      .select(["uuid", "name"])
      .where(
        "name",
        "in",
        relations.creators.map((creator) => creator.name),
      )
      .execute()

    await db
      .insertInto("bookToCreator")
      .values(
        creators.map((creator) => ({
          uuid: randomUUID(),
          bookUuid: book.uuid,
          creatorUuid: creator.uuid,
          role:
            relations.creators?.find((c) => c.name === creator.name)?.role ??
            "aut",
        })),
      )
      .execute()
  }

  if (relations?.series?.length) {
    await db
      .insertInto("series")
      .values(
        relations.series.map((s) => ({
          uuid: s.uuid,
          name: s.name,
        })),
      )
      .execute()

    const series = await db
      .selectFrom("series")
      .select(["uuid", "name"])
      .where(
        "name",
        "in",
        relations.series.map((series) => series.name),
      )
      .execute()

    await db
      .insertInto("bookToSeries")
      .values(
        series.map((series, index) => ({
          uuid: randomUUID(),
          bookUuid: book.uuid,
          seriesUuid: series.uuid,
          featured: index === 0,
          position: relations.series?.find((s) => s.name === series.name)
            ?.position,
        })),
      )
      .execute()
  }

  if (relations?.tags?.length) {
    await db.insertInto("tag").values(relations.tags).execute()

    const tags = await db
      .selectFrom("tag")
      .select(["uuid"])
      .where(
        "name",
        "in",
        relations.tags.map((tag) => tag.name),
      )
      .execute()

    await db
      .insertInto("bookToTag")
      .values(
        tags.map((tag) => ({
          uuid: randomUUID(),
          bookUuid: book.uuid,
          tagUuid: tag.uuid,
        })),
      )
      .execute()
  }

  if (relations?.position) {
    await db
      .insertInto("position")
      .values({ ...relations.position, bookUuid: book.uuid })
      .execute()
  }

  return await getBook(book.uuid)
}

function bookQuery() {
  return db
    .selectFrom("book")
    .selectAll("book")
    .select((eb) => [
      jsonArrayFrom(
        eb
          .selectFrom("creator")
          .distinct()
          .innerJoin(
            "bookToCreator",
            "bookToCreator.creatorUuid",
            "creator.uuid",
          )
          .select([
            "creator.uuid",
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
          .selectFrom("creator")
          .distinct()
          .innerJoin(
            "bookToCreator",
            "bookToCreator.creatorUuid",
            "creator.uuid",
          )
          .select([
            "creator.uuid",
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
          .selectFrom("creator")
          .distinct()
          .innerJoin(
            "bookToCreator",
            "bookToCreator.creatorUuid",
            "creator.uuid",
          )
          .select([
            "creator.uuid",
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
          .selectFrom("series")
          .distinct()
          .innerJoin("bookToSeries", "bookToSeries.seriesUuid", "series.uuid")
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
          .selectFrom("tag")
          .distinct()
          .innerJoin("bookToTag", "bookToTag.tagUuid", "tag.uuid")
          .select(["tag.uuid", "tag.name", "tag.createdAt", "tag.updatedAt"])
          .whereRef("bookToTag.bookUuid", "=", "book.uuid"),
      ).as("tags"),
      jsonArrayFrom(
        eb
          .selectFrom("collection")
          .distinct()
          .innerJoin(
            "bookToCollection",
            "bookToCollection.collectionUuid",
            "collection.uuid",
          )
          .select([
            "collection.uuid",
            "collection.name",
            "collection.description",
            "collection.public",
            "collection.createdAt",
            "collection.updatedAt",
          ])
          .whereRef("bookToCollection.bookUuid", "=", "book.uuid"),
      ).as("collections"),
      jsonObjectFrom(
        eb
          .selectFrom("status")
          .select([
            "status.uuid",
            "status.name",
            "status.createdAt",
            "status.updatedAt",
          ])
          .innerJoin("bookToStatus", "bookToStatus.statusUuid", "status.uuid")
          .select(["bookToStatus.dirty"])
          .whereRef("bookToStatus.bookUuid", "=", "book.uuid"),
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
          .whereRef("book.uuid", "=", "position.bookUuid"),
      ).as("position"),
      jsonObjectFrom(
        eb
          .selectFrom("ebook")
          .select([
            "ebook.uuid",
            "ebook.downloadStatus",
            "ebook.downloadProgress",
            "ebook.manifest",
            "ebook.positions",
            sql.lit<"ebook">("ebook").as("format"),
            "ebook.createdAt",
            "ebook.updatedAt",
          ])
          .whereRef("ebook.bookUuid", "=", "book.uuid"),
      ).as("ebook"),
      jsonObjectFrom(
        eb
          .selectFrom("audiobook")
          .select([
            "audiobook.uuid",
            "audiobook.manifest",
            "audiobook.downloadStatus",
            "audiobook.downloadProgress",
            sql.lit<"audiobook">("audiobook").as("format"),
            "audiobook.createdAt",
            "audiobook.updatedAt",
          ])
          .whereRef("audiobook.bookUuid", "=", "book.uuid"),
      ).as("audiobook"),
      jsonObjectFrom(
        eb
          .selectFrom("readaloud")
          .select([
            "readaloud.uuid",
            "readaloud.downloadStatus",
            "readaloud.downloadProgress",
            "readaloud.epubManifest",
            "readaloud.audioManifest",
            "readaloud.positions",
            "readaloud.status",
            sql.lit<"readaloud">("readaloud").as("format"),
            "readaloud.createdAt",
            "readaloud.updatedAt",
          ])
          .whereRef("readaloud.bookUuid", "=", "book.uuid"),
      ).as("readaloud"),
    ])
}

export async function getBooks() {
  return await bookQuery().execute()
}

export async function getBooksWithAnnotations() {
  return await bookQuery()
    .select((eb) => [
      jsonArrayFrom(
        eb
          .selectFrom("bookmark")
          .select(["bookmark.uuid", "bookmark.locator"])
          .whereRef("bookmark.bookUuid", "=", "book.uuid"),
      ).as("bookmarks"),
      jsonArrayFrom(
        eb
          .selectFrom("highlight")
          .select(["highlight.uuid", "highlight.locator", "highlight.color"])
          .whereRef("highlight.bookUuid", "=", "book.uuid"),
      ).as("highlights"),
    ])
    .execute()
}

export async function getBook(uuid: UUID) {
  return (
    (await bookQuery().where("book.uuid", "=", uuid).executeTakeFirst()) ?? null
  )
}

export async function updateBookStatus(uuid: UUID, statusUuid: UUID) {
  await db
    .updateTable("bookToStatus")
    .set({ statusUuid, dirty: true })
    .where("bookUuid", "=", uuid)
    .execute()
}

export async function deleteBook(uuid: UUID) {
  await db.deleteFrom("book").where("uuid", "=", uuid).execute()
}

export async function deleteBooks(uuids: UUID[]) {
  if (!uuids.length) return
  await db.deleteFrom("book").where("uuid", "in", uuids).execute()
}

export async function detachBooksFromServer(server: Server, uuids: UUID[]) {
  if (!uuids.length) return
  const urls = await Promise.all(
    uuids.map(async (uuid) => ({
      ebook: await Image.getCachePathAsync(
        getCoverUrl(server.baseUrl, uuid, {
          height: 353,
          width: 232,
        }),
      ),
      audiobook: await Image.getCachePathAsync(
        getCoverUrl(server.baseUrl, uuid, {
          height: 232,
          width: 232,
          audio: true,
        }),
      ),
    })),
  )

  await db
    .updateTable("book")
    .from(
      uuids
        .slice(1)
        .reduce(
          (qb, uuid, index) =>
            qb.union(
              db.selectNoFrom([
                sql<string>`${uuid}`.as("uuid"),
                sql<string>`${urls[index + 1]?.ebook}`.as("ebookUrl"),
                sql<string>`${urls[index + 1]?.audiobook}`.as("audiobookUrl"),
              ]),
            ),
          db.selectNoFrom([
            sql<string>`${uuids[0]}`.as("uuid"),
            sql<string>`${urls[0]?.ebook}`.as("ebookUrl"),
            sql<string>`${urls[0]?.audiobook}`.as("audiobookUrl"),
          ]),
        )
        .as("dataTable"),
    )
    .set((eb) => ({
      serverUuid: null,
      ebookCoverUrl: eb.ref("dataTable.ebookUrl"),
      audiobookCoverUrl: eb.ref("dataTable.audiobookUrl"),
    }))
    .whereRef("book.uuid", "=", "dataTable.uuid")
    .execute()
}

export async function deleteBooksFromServer(
  serverUuid: UUID,
  tr?: Transaction<DB>,
) {
  const callback = async (tr: Transaction<DB>) => {
    const downloaded = await tr
      .selectFrom("book")
      .select("book.uuid")
      .where("book.serverUuid", "=", serverUuid)
      .leftJoin("audiobook", "book.uuid", "audiobook.bookUuid")
      .leftJoin("ebook", "book.uuid", "ebook.bookUuid")
      .leftJoin("readaloud", "book.uuid", "readaloud.bookUuid")
      .where((eb) =>
        eb.or([
          eb("audiobook.downloadStatus", "=", "DOWNLOADED"),
          eb("ebook.downloadStatus", "=", "DOWNLOADED"),
          eb("readaloud.downloadStatus", "=", "DOWNLOADED"),
        ]),
      )
      .execute()

    await tr
      .deleteFrom("book")
      .where((eb) =>
        eb(
          "uuid",
          "not in",
          downloaded.map(({ uuid }) => uuid),
        ),
      )
      .execute()

    await tr
      .updateTable("book")
      .set({ serverUuid: null })
      .where(
        "uuid",
        "in",
        downloaded.map(({ uuid }) => uuid),
      )
      .execute()

    return downloaded.map(({ uuid }) => uuid)
  }

  if (tr) {
    return await callback(tr)
  }

  return await db.transaction().execute(callback)
}

export async function addBookToDownloadQueue(
  bookUuid: UUID,
  format: "ebook" | "audiobook" | "readaloud",
) {
  await db.transaction().execute(async (tr) => {
    const downloading = await tr
      .selectFrom("audiobook")
      .select("uuid")
      .where((eb) =>
        eb.or([
          eb("audiobook.downloadStatus", "=", "DOWNLOADING"),
          eb("audiobook.downloadStatus", "=", "PAUSED"),
        ]),
      )
      .union(
        tr
          .selectFrom("ebook")
          .select("uuid")
          .where((eb) =>
            eb.or([
              eb("ebook.downloadStatus", "=", "DOWNLOADING"),
              eb("ebook.downloadStatus", "=", "PAUSED"),
            ]),
          ),
      )
      .union(
        tr
          .selectFrom("readaloud")
          .select("uuid")
          .where((eb) =>
            eb.or([
              eb("readaloud.downloadStatus", "=", "DOWNLOADING"),
              eb("readaloud.downloadStatus", "=", "PAUSED"),
            ]),
          ),
      )
      .executeTakeFirst()

    const lastInQueue = await tr
      .selectFrom("audiobook")
      .select(["uuid", "downloadQueuePosition"])
      .union(tr.selectFrom("ebook").select(["uuid", "downloadQueuePosition"]))
      .union(
        tr.selectFrom("readaloud").select(["uuid", "downloadQueuePosition"]),
      )
      .orderBy("downloadQueuePosition", "desc")
      .limit(1)
      .executeTakeFirst()

    if (downloading) {
      await tr
        .updateTable(format)
        .set({
          downloadStatus: "QUEUED",
          downloadQueuePosition: (lastInQueue?.downloadQueuePosition ?? 0) + 1,
        })
        .where("bookUuid", "=", bookUuid)
        .execute()
    } else {
      await tr
        .updateTable(format)
        .set({
          downloadStatus: "DOWNLOADING",
          downloadQueuePosition: (lastInQueue?.downloadQueuePosition ?? 0) + 1,
        })
        .where("bookUuid", "=", bookUuid)
        .execute()
    }
  })
}

export async function removeBookDownloads(
  bookUuid: UUID,
  format?: "ebook" | "readaloud" | "audiobook",
) {
  await db.transaction().execute(async (tr) => {
    if (!format || format === "audiobook") {
      await tr
        .updateTable("audiobook")
        .set({ downloadStatus: "NONE", downloadProgress: 0, manifest: null })
        .where("bookUuid", "=", bookUuid)
        .execute()
    }
    if (!format || format === "ebook") {
      await tr
        .updateTable("ebook")
        .set({
          downloadStatus: "NONE",
          downloadProgress: 0,
          manifest: null,
          positions: null,
        })
        .where("bookUuid", "=", bookUuid)
        .execute()
    }
    if (!format || format === "readaloud") {
      await tr
        .updateTable("readaloud")
        .set({
          downloadStatus: "NONE",
          downloadProgress: 0,
          audioManifest: null,
          epubManifest: null,
          positions: null,
        })
        .where("bookUuid", "=", bookUuid)
        .execute()
    }
  })
}

export async function updateBook(uuid: UUID, update: BookUpdate) {
  await db.updateTable("book").set(update).where("uuid", "=", uuid).execute()
}
