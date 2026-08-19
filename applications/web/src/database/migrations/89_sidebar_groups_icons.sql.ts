import { sql } from "kysely"

import { db } from "@/database/connection"

const MAIN_BUILTINS = new Set(["home", "books"])

export default async function migrate() {
  await db.transaction().execute(async (trx) => {
    const usersWithSidebar = await sql<{ userId: string }>`
      SELECT DISTINCT user_id as "userId" FROM sidebar_item
    `.execute(trx)

    for (const { userId } of usersWithSidebar.rows) {
      const mainGroupUuid = crypto.randomUUID()
      const libraryGroupUuid = crypto.randomUUID()

      await sql`
        INSERT INTO sidebar_group (uuid, user_id, name, position)
        VALUES (${mainGroupUuid}, ${userId}, 'Main', 0)
      `.execute(trx)

      await sql`
        INSERT INTO sidebar_group (uuid, user_id, name, position)
        VALUES (${libraryGroupUuid}, ${userId}, 'Library', 1)
      `.execute(trx)

      const items = await sql<{
        uuid: string
        kind: string
        builtinKey: string | null
      }>`
        SELECT uuid, kind, builtin_key as "builtinKey"
        FROM sidebar_item
        WHERE user_id = ${userId}
      `.execute(trx)

      for (const item of items.rows) {
        const isMain =
          item.kind === "builtin" && MAIN_BUILTINS.has(item.builtinKey ?? "")

        const groupUuid = isMain ? mainGroupUuid : libraryGroupUuid

        await sql`
          UPDATE sidebar_item SET group_uuid = ${groupUuid} WHERE uuid = ${item.uuid}
        `.execute(trx)
      }
    }
  })
}
