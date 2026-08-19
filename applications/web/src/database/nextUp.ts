import { type UUID } from "@/uuid"

import { type BookWithRelations, getBooks } from "./books"
import { db } from "./connection"
import { STATUS_READ, STATUS_READING, STATUS_TO_READ } from "./statusKinds"

export async function getNextUpInSeries(
  userId: UUID,
  limit = 20,
): Promise<BookWithRelations[]> {
  const r = await db
    // series where the user is reading or has read at least one book, with
    // the most recent activity in each
    .with("readingSeries", (db) =>
      db
        .selectFrom("bookToSeries")
        .innerJoin(
          "bookToStatus",
          "bookToStatus.bookUuid",
          "bookToSeries.bookUuid",
        )
        .innerJoin("status", "status.uuid", "bookToStatus.statusUuid")
        .leftJoin("position", (join) =>
          join
            .onRef("position.bookUuid", "=", "bookToSeries.bookUuid")
            .on("position.userId", "=", userId),
        )
        .where("bookToStatus.userId", "=", userId)
        .where("status.name", "in", [STATUS_READ, STATUS_READING])
        .select((eb) => [
          "bookToSeries.seriesUuid",
          eb.fn.max("position.timestamp").as("lastReadAt"),
          eb.fn.max("bookToStatus.updatedAt").as("lastStatusAt"),
        ])
        .groupBy("bookToSeries.seriesUuid"),
    )
    .with("candidates", (db) =>
      db
        .selectFrom("bookToSeries")
        .innerJoin(
          "readingSeries",
          "readingSeries.seriesUuid",
          "bookToSeries.seriesUuid",
        )
        .innerJoin(
          "bookToStatus",
          "bookToStatus.bookUuid",
          "bookToSeries.bookUuid",
        )
        .innerJoin("status", "status.uuid", "bookToStatus.statusUuid")
        .where("bookToStatus.userId", "=", userId)
        .where("status.name", "=", STATUS_TO_READ)
        .select((eb) => [
          "bookToSeries.bookUuid",
          "readingSeries.lastReadAt",
          "readingSeries.lastStatusAt",
          eb.fn
            .agg("row_number")
            .over((ob) =>
              ob
                .partitionBy("bookToSeries.seriesUuid")
                .orderBy("bookToSeries.position", (ob) => ob.asc().nullsLast()),
            )
            .as("rn"),
        ]),
    )
    .selectFrom("candidates")
    .select(["candidates.bookUuid"])
    .where("candidates.rn", "=", 1)
    .orderBy("candidates.lastReadAt", "desc")
    .orderBy("candidates.lastStatusAt", "desc")
    .limit(limit)
    .execute()

  const uuids = [...new Set(r.map((r) => r.bookUuid))]
  if (uuids.length === 0) return []

  // hydrate through getBooks so visibility rules and relations apply, then
  // restore the activity order (getBooks does not preserve input order)
  const books = await getBooks(uuids, userId)
  const byUuid = new Map(books.map((b) => [b.uuid, b]))
  return uuids
    .map((uuid) => byUuid.get(uuid))
    .filter((b): b is BookWithRelations => b !== undefined)
}
