import { type Insertable, type Selectable } from "kysely"

import { type UUID } from "@/uuid"

import { db } from "./db"
import { type DB } from "./schema"

export type Bookmark = Selectable<DB["bookmark"]>
export type NewBookmark = Omit<Insertable<DB["bookmark"]>, "locator"> & {
  locator: string
}

export async function getBookBookmarks(bookUuid: UUID) {
  return await db
    .selectFrom("bookmark")
    .selectAll()
    .where("bookUuid", "=", bookUuid)
    .execute()
}

export async function createBookmark(bookmark: NewBookmark) {
  await db
    .insertInto("bookmark")
    .values(bookmark as unknown as Insertable<DB["bookmark"]>)
    .execute()
}

export async function deleteBookmarks(bookUuid: UUID, bookmarkUuids: UUID[]) {
  await db
    .deleteFrom("bookmark")
    .where("bookUuid", "=", bookUuid)
    .where("uuid", "in", bookmarkUuids)
    .execute()
}
