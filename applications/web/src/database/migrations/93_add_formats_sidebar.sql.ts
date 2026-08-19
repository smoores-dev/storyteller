import { sql } from "kysely"

import { db } from "@/database/connection"

export default async function migrate() {
  await db.transaction().execute(async (trx) => {
    const libraryGroups = await sql<{ uuid: string; userId: string }>`
      SELECT uuid, user_id as "userId"
      FROM sidebar_group
      WHERE name = 'Library'
    `.execute(trx)

    for (const group of libraryGroups.rows) {
      const existing = await sql<{ uuid: string }>`
        SELECT uuid FROM sidebar_item
        WHERE user_id = ${group.userId}
          AND kind = 'builtin'
          AND builtin_key = 'formats'
      `.execute(trx)

      if (existing.rows.length > 0) continue

      const maxPos = await sql<{ maxPos: number | null }>`
        SELECT MAX(position) as "maxPos"
        FROM sidebar_item
        WHERE group_uuid = ${group.uuid}
      `.execute(trx)

      const nextPos = (maxPos.rows[0]?.maxPos ?? -1) + 1

      await sql`
        INSERT INTO sidebar_item (uuid, user_id, group_uuid, kind, builtin_key, position, hidden)
        VALUES (${crypto.randomUUID()}, ${group.userId}, ${group.uuid}, 'builtin', 'formats', ${nextPos}, 0)
      `.execute(trx)
    }
  })
}
