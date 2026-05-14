import { sql } from "kysely"

import { minutesToCronExpression } from "@/assets/library/scanner/triggers/cron"
import { db } from "@/database/connection"
import { defaultMetadataFieldOverrides } from "@/database/settingsTypes"

const hasColumn = async (trx: typeof db, table: string, column: string) => {
  const tableMetadata = (await trx.introspection.getTables()).find(
    (t) => t.name === table,
  )
  if (!tableMetadata) {
    throw new Error(`Table ${table} not found`)
  }
  return tableMetadata.columns.some((col) => col.name === column)
}

async function addFormatTableColumns(trx: typeof db) {
  const tables = ["ebook", "audiobook", "readaloud"]

  for (const table of tables) {
    if (!(await hasColumn(trx, table, "manifest"))) {
      await trx.schema
        .alterTable(table)
        .addColumn("manifest", "jsonb")
        .execute()
    }

    if (table !== "audiobook") {
      if (!(await hasColumn(trx, table, "page_count"))) {
        await trx.schema
          .alterTable(table)
          .addColumn("page_count", "integer")
          .execute()
      }

      if (!(await hasColumn(trx, table, "is_epub2"))) {
        await sql`ALTER TABLE ${sql.ref(table)} ADD COLUMN is_epub2 BOOLEAN NOT NULL DEFAULT FALSE`.execute(
          trx,
        )
      }
    }

    if (table !== "ebook") {
      if (!(await hasColumn(trx, table, "duration"))) {
        await trx.schema
          .alterTable(table)
          .addColumn("duration", "real")
          .execute()
      }
    }

    if (!(await hasColumn(trx, table, "file_size"))) {
      await trx.schema
        .alterTable(table)
        .addColumn("file_size", "integer")
        .execute()
    }
  }
}

async function addFingerprintColumns(trx: typeof db) {
  for (const table of ["ebook", "audiobook", "readaloud"]) {
    if (!(await hasColumn(trx, table, "fingerprint"))) {
      await trx.schema
        .alterTable(table)
        .addColumn("fingerprint", "text")
        .execute()
    }
  }
}

// adds custom pageCount and duration columns to the book table
async function addBookTableColumns(trx: typeof db) {
  if (!(await hasColumn(trx, "book", "duration"))) {
    await trx.schema.alterTable("book").addColumn("duration", "real").execute()
  }

  if (!(await hasColumn(trx, "book", "page_count"))) {
    await trx.schema
      .alterTable("book")
      .addColumn("page_count", "integer")
      .execute()
  }
}

async function cronExpressionSettings(trx: typeof db) {
  // check setting
  const cronSetting = await trx
    .selectFrom("settings")
    .where("name", "=", "scanCronExpression")
    .selectAll()
    .execute()

  if (cronSetting.length === 0) {
    await trx
      .insertInto("settings")
      .values({
        name: "scanCronExpression",
        value: JSON.stringify(minutesToCronExpression(60 * 60 * 24)),
      })
      .execute()
  }
}

async function metadataFieldOverridesSettings(trx: typeof db) {
  // check setting
  const metadataFieldOverridesSetting = await trx
    .selectFrom("settings")
    .where("name", "=", "metadataFieldOverrides")
    .selectAll()
    .execute()

  if (metadataFieldOverridesSetting.length === 0) {
    const defaultOverrides = defaultMetadataFieldOverrides()

    await trx
      .insertInto("settings")
      .values({
        name: "metadataFieldOverrides",
        value: JSON.stringify(defaultOverrides),
      })
      .execute()
  }
}

export default async function migrate() {
  await db.transaction().execute(async (trx) => {
    await addFormatTableColumns(trx)
    await addBookTableColumns(trx)
    await addFingerprintColumns(trx)
    await cronExpressionSettings(trx)
    await metadataFieldOverridesSettings(trx)
  })
}
