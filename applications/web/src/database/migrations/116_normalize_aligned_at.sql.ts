import { db } from "@/database/connection"
import { toIsoDateTimeString } from "@/dates"
import { logger } from "@/logging"

export default async function migrate() {
  const rows = await db
    .selectFrom("book")
    .select(["uuid", "alignedAt"])
    .where("alignedAt", "is not", null)
    .where("alignedAt", "not like", "____-__-__%")
    .execute()

  for (const row of rows) {
    const alignedAt = toIsoDateTimeString(row.alignedAt)
    if (!alignedAt) {
      logger.warn({
        msg: "Clearing unparseable alignedAt",
        bookUuid: row.uuid,
        alignedAt: row.alignedAt,
      })
    }
    await db
      .updateTable("book")
      .set({ alignedAt })
      .where("uuid", "=", row.uuid)
      .execute()
  }
}
