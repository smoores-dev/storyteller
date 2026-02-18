import { type Kysely } from "kysely"

import { type DB } from "@/database/schema"
import { type ReadiumLocator } from "@/modules/readium/src/Readium.types"

export async function up(db: Kysely<DB>): Promise<void> {
  const positions = await db.selectFrom("position").selectAll().execute()

  for (const position of positions) {
    const locator = {
      ...position.locator,
      href: encodeURI(position.locator.href).slice(1),
    }
    await db
      .updateTable("position")
      .set({ locator: JSON.stringify(locator) as unknown as ReadiumLocator })
      .where("uuid", "=", position.uuid)
      .execute()
  }

  const bookmarks = await db.selectFrom("bookmark").selectAll().execute()

  for (const bookmark of bookmarks) {
    const locator = {
      ...bookmark.locator,
      href: encodeURI(bookmark.locator.href).slice(1),
    }
    await db
      .updateTable("bookmark")
      .set({ locator: JSON.stringify(locator) as unknown as ReadiumLocator })
      .where("uuid", "=", bookmark.uuid)
      .execute()
  }

  const highlights = await db.selectFrom("highlight").selectAll().execute()

  for (const highlight of highlights) {
    const locator = {
      ...highlight.locator,
      href: encodeURI(highlight.locator.href).slice(1),
    }
    await db
      .updateTable("highlight")
      .set({ locator: JSON.stringify(locator) as unknown as ReadiumLocator })
      .where("uuid", "=", highlight.uuid)
      .execute()
  }
}

export async function down(db: Kysely<DB>): Promise<void> {
  const positions = await db.selectFrom("position").selectAll().execute()

  for (const position of positions) {
    const locator = {
      ...position.locator,
      href: `/${decodeURI(position.locator.href)}`,
    }

    await db
      .updateTable("position")
      .set({ locator: JSON.stringify(locator) as unknown as ReadiumLocator })
      .where("uuid", "=", position.uuid)
      .execute()
  }

  const bookmarks = await db.selectFrom("bookmark").selectAll().execute()

  for (const bookmark of bookmarks) {
    const locator = {
      ...bookmark.locator,
      href: `/${decodeURI(bookmark.locator.href)}`,
    }

    await db
      .updateTable("bookmark")
      .set({ locator: JSON.stringify(locator) as unknown as ReadiumLocator })
      .where("uuid", "=", bookmark.uuid)
      .execute()
  }

  const highlights = await db.selectFrom("highlight").selectAll().execute()

  for (const highlight of highlights) {
    const locator = {
      ...highlight.locator,
      href: `/${decodeURI(highlight.locator.href)}`,
    }

    await db
      .updateTable("highlight")
      .set({ locator: JSON.stringify(locator) as unknown as ReadiumLocator })
      .where("uuid", "=", highlight.uuid)
      .execute()
  }
}
