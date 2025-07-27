import { UUID } from "@/uuid"
import { booksQuery } from "./books"
import { sql } from "kysely"

export async function getCurrentlyReading(userId: UUID) {
  return await booksQuery(userId)
    .leftJoin("position", (join) =>
      join
        .onRef("position.bookUuid", "=", "book.uuid")
        .on("position.userId", "=", userId),
    )
    .innerJoin("status", "status.uuid", "book.statusUuid")
    .where("status.name", "=", "Reading")
    .whereRef("position.updatedAt", ">", sql`datetime('now', '-1 month')`)
    .orderBy("position.updatedAt", "desc")
    // Fallback to auto-incrementing rowid
    // to break ties in updatedAt (which can happen
    // for migrated books)
    .orderBy(sql`position.rowid`, "desc")
    .limit(10)
    .execute()
}

export async function getNextUp(userId: UUID) {
  return await booksQuery(userId)
    .innerJoin("bookToSeries", "book.uuid", "bookToSeries.bookUuid")
    .innerJoin("bookToSeries as prequelToSeries", (join) =>
      join.onRef("bookToSeries.position", ">", "prequelToSeries.position"),
    )
    .innerJoin("book as prequel", "prequelToSeries.bookUuid", "prequel.uuid")
    .innerJoin("status", (join) =>
      join
        .onRef("status.uuid", "=", "prequel.statusUuid")
        .on("status.name", "=", "Read"),
    )
    .leftJoin("position", (join) =>
      join
        .onRef("position.bookUuid", "=", "prequel.uuid")
        .on("position.userId", "=", userId),
    )
    .orderBy("position.updatedAt", "desc")
    // Fallback to auto-incrementing rowid
    // to break ties in updatedAt (which can happen
    // for migrated books)
    .orderBy(sql`position.rowid`, "desc")
    .limit(10)
    .execute()
}

export async function getRecentlyAdded(userId: UUID) {
  return await booksQuery(userId)
    .orderBy("book.createdAt", "desc")
    // Fallback to auto-incrementing rowid
    // to break ties in createdAt (which can happen
    // for migrated books)
    .orderBy(sql`book.rowid`, "desc")
    .limit(10)
    .execute()
}

export async function getStartReading(userId: UUID) {
  return await booksQuery(userId)
    .innerJoin("status", (join) =>
      join
        .onRef("status.uuid", "=", "book.statusUuid")
        .on("status.name", "=", "To read"),
    )
    .orderBy("book.createdAt", "desc")
    // Fallback to auto-incrementing rowid
    // to break ties in createdAt (which can happen
    // for migrated books)
    .orderBy(sql`book.rowid`, "desc")
    .limit(10)
    .execute()
}
