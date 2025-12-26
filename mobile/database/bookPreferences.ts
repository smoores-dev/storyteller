import { type UUID, randomUUID } from "@/uuid"

import { db } from "./db"
import { type BookPreferences } from "./preferencesTypes"

export async function getBookPreferences(
  bookUuid: UUID,
): Promise<BookPreferences> {
  const rows = await db
    .selectFrom("bookPreferences")
    .select(["name", "value"])
    .where("bookPreferences.bookUuid", "=", bookUuid)
    .execute()

  return rows.reduce(
    (acc, row) => ({
      ...acc,
      [row.name]:
        // We configured Kysely to auto-parse JSON objects and arrays,
        // so we need to guard against values that have already been parsed
        typeof row.value === "string"
          ? (JSON.parse(row.value) as BookPreferences[keyof BookPreferences])
          : row.value,
    }),
    {},
  )
}

export async function updateBookPreference(
  bookUuid: UUID,
  name: keyof BookPreferences,
  value: BookPreferences[keyof BookPreferences],
) {
  await db.transaction().execute(async (tr) => {
    const existing = await tr
      .selectFrom("bookPreferences")
      .select("uuid")
      .where("bookUuid", "=", bookUuid)
      .where("name", "=", name)
      .executeTakeFirst()

    if (!existing) {
      await tr
        .insertInto("bookPreferences")
        .values({
          uuid: randomUUID(),
          bookUuid,
          name,
          value: JSON.stringify(value),
        })
        .execute()
    } else {
      await tr
        .updateTable("bookPreferences")
        .set({ value: JSON.stringify(value) })
        .where("uuid", "=", existing.uuid)
        .execute()
    }
  })
}
