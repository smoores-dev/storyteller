import { type Insertable, type Updateable } from "kysely"

import { type UUID } from "@/uuid"

import { db } from "./db"
import { type DB } from "./schema"

export type NewPosition = Omit<Insertable<DB["position"]>, "locator"> & {
  locator: string
}
export type PositionUpdate = Omit<Updateable<DB["position"]>, "locator"> & {
  locator: string
}

export async function updateBookPosition(
  bookUuid: UUID,
  update: PositionUpdate,
) {
  return await db
    .updateTable("position")
    .set(update as unknown as Insertable<DB["position"]>)
    .where("bookUuid", "=", bookUuid)
    .execute()
}

export async function getBookPosition(bookUuid: UUID) {
  return await db
    .selectFrom("position")
    .selectAll()
    .where("bookUuid", "=", bookUuid)
    .executeTakeFirst()
}

export async function getPositions() {
  return await db.selectFrom("position").selectAll().execute()
}

export async function getDownloadedPositions() {
  return await db
    .selectFrom("position")
    .selectAll()
    .innerJoin("book", "book.uuid", "position.bookUuid")
    .select(["book.serverUuid"])
    .innerJoin("ebook", "book.uuid", "ebook.bookUuid")
    .innerJoin("audiobook", "book.uuid", "audiobook.bookUuid")
    .innerJoin("readaloud", "book.uuid", "readaloud.bookUuid")
    .where("book.serverUuid", "is not", null)
    .where((eb) =>
      eb.or([
        eb("ebook.downloadStatus", "=", "DOWNLOADED"),
        eb("audiobook.downloadStatus", "=", "DOWNLOADED"),
        eb("readaloud.downloadStatus", "=", "DOWNLOADED"),
      ]),
    )
    .execute()
}
