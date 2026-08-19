import { type Selectable, type Transaction } from "kysely"

import { BookEvents } from "@/events"
import { type UUID } from "@/uuid"

import { db } from "./connection"
import { type DB } from "./schema"
import { isWellKnownStatus } from "./statusKinds"

export type Status = Selectable<DB["status"]>

export async function getStatuses() {
  return db.selectFrom("status").selectAll().execute()
}

export async function getStatus(uuid: UUID) {
  return db
    .selectFrom("status")
    .selectAll()
    .where("uuid", "=", uuid)
    .executeTakeFirstOrThrow()
}

export async function getDefaultStatus(
  tr?: Transaction<DB>,
): Promise<Status | undefined> {
  return (tr ?? db)
    .selectFrom("status")
    .selectAll("status")
    .where("isDefault", "=", true)
    .executeTakeFirst()
}

export async function createStatus(name: string, label?: string) {
  return db
    .insertInto("status")
    .values({ name, label: label ?? name, isDefault: false })
    .returningAll()
    .executeTakeFirstOrThrow()
}

export async function deleteStatus(uuid: UUID) {
  const status = await getStatus(uuid)

  if (isWellKnownStatus(status.name)) {
    throw new Error("Cannot delete a core status")
  }

  await db.transaction().execute(async (tr) => {
    await tr.deleteFrom("bookToStatus").where("statusUuid", "=", uuid).execute()

    await tr.deleteFrom("status").where("uuid", "=", uuid).execute()
  })
}

export async function setLibraryDefaultStatus(uuid: UUID | null) {
  await db.transaction().execute(async (tr) => {
    await tr
      .updateTable("status")
      .set({ isDefault: false })
      .where("isDefault", "=", true)
      .execute()

    if (uuid) {
      await tr
        .updateTable("status")
        .set({ isDefault: true })
        .where("uuid", "=", uuid)
        .execute()
    }
  })
}

export async function updateStatusLabel(uuid: UUID, label: string) {
  return db
    .updateTable("status")
    .set({ label })
    .where("uuid", "=", uuid)
    .executeTakeFirstOrThrow()
}

export async function updateStatusForBooks(
  statusUuid: UUID | null,
  bookUuids: UUID[],
  userId: UUID,
) {
  if (bookUuids.length === 0) return

  if (statusUuid === null) {
    await db
      .deleteFrom("bookToStatus")
      .where("bookUuid", "in", bookUuids)
      .where("userId", "=", userId)
      .execute()
  } else {
    await db.transaction().execute(async (tr) => {
      const existing = await tr
        .selectFrom("bookToStatus")
        .select("bookUuid")
        .where("bookUuid", "in", bookUuids)
        .where("userId", "=", userId)
        .execute()

      await tr
        .updateTable("bookToStatus")
        .set({ statusUuid })
        .where("bookUuid", "in", bookUuids)
        .where("userId", "=", userId)
        .execute()

      const existingBooks = new Set(existing.map((row) => row.bookUuid))
      const missing = bookUuids.filter((uuid) => !existingBooks.has(uuid))

      if (missing.length > 0) {
        await tr
          .insertInto("bookToStatus")
          .values(missing.map((bookUuid) => ({ bookUuid, statusUuid, userId })))
          .execute()
      }
    })
  }

  const status = statusUuid === null ? null : await getStatus(statusUuid)

  bookUuids.forEach((bookUuid) => {
    BookEvents.emit("message", {
      type: "bookUpdated",
      bookUuid,
      payload: {
        status,
      },
    })
  })
}
