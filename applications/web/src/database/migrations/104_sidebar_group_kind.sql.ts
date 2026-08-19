import { sql } from "kysely"

import { db } from "@/database/connection"

export default async function migrate() {
  await db.transaction().execute(async (trx) => {
    const sidebarGroup = (await trx.introspection.getTables()).find(
      (t) => t.name === "sidebar_group",
    )
    if (!sidebarGroup) return

    if (!sidebarGroup.columns.find((c) => c.name === "kind")) {
      await sql`ALTER TABLE sidebar_group ADD COLUMN kind TEXT;`.execute(trx)
    }
    if (sidebarGroup.columns.find((c) => c.name === "collapsed")) {
      await sql`ALTER TABLE sidebar_group DROP COLUMN collapsed;`.execute(trx)
    }
    if (sidebarGroup.columns.find((c) => c.name === "hidden")) {
      await sql`ALTER TABLE sidebar_group DROP COLUMN hidden;`.execute(trx)
    }

    await sql`DELETE FROM sidebar_item;`.execute(trx)
    await sql`DELETE FROM sidebar_group;`.execute(trx)

    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_sidebar_group_user_kind ON sidebar_group (user_id, kind) WHERE kind IS NOT NULL;`.execute(
      trx,
    )
  })
}
