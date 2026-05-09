import { sql } from "kysely"

import { db } from "@/database/connection"

const hasColumn = async (trx: typeof db, table: string, column: string) => {
  const tableMetadata = (await trx.introspection.getTables()).find(
    (t) => t.name === table,
  )
  if (!tableMetadata) {
    throw new Error(`Table ${table} not found`)
  }
  return tableMetadata.columns.some((col) => col.name === column)
}

// function minutesToCronExpression(minutes: number): string {
//   if (minutes < 1) {
//     return "* * * * *"
//   }

//   if (minutes < 60 && 60 % minutes === 0) {
//     return `*/${minutes} * * * *`
//   }

//   const hours = Math.floor(minutes / 60)
//   if (hours >= 1 && hours <= 24 && 24 % hours === 0) {
//     const remainderMinutes = minutes % 60
//     return `${remainderMinutes} */${hours} * * *`
//   }

//   return `0 */${Math.max(1, hours)} * * *`
// }

async function addFormatTableColumns(trx: typeof db) {
  const tables = ["ebook", "audiobook", "readaloud"]

  for (const table of tables) {
    if (!(await hasColumn(trx, table, "content_hash"))) {
      await trx.schema
        .alterTable(table)
        .addColumn("content_hash", "text")
        .execute()
    }

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

// async function getSettingValue(
//   trx: typeof db,
//   name: string,
// ): Promise<string | null> {
//   const row = await trx
//     .selectFrom("settings")
//     .select("value")
//     .where("name", "=", name as never)
//     .executeTakeFirst()

//   return row?.value ?? null
// }

// async function upsertSetting(trx: typeof db, name: string, value: string) {
//   const existing = await getSettingValue(trx, name)

//   if (existing !== null) {
//     return
//   }

//   await trx
//     .insertInto("settings")
//     .values({ name: name as never, value })
//     .execute()
// }

// async function migrateSettings(trx: typeof db) {
//   // migrate existingBooksScanIntervalMinutes -> scanCronExpression
//   const intervalRaw = await getSettingValue(
//     trx,
//     "existingBooksScanIntervalMinutes",
//   )
//   const cronRaw = await getSettingValue(trx, "scanCronExpression")
//   const hasCron = cronRaw !== null && cronRaw !== "null"

//   if (!hasCron && intervalRaw !== null && intervalRaw !== "null") {
//     const minutes = JSON.parse(intervalRaw) as number | null

//     if (minutes && minutes > 0) {
//       const cron = minutesToCronExpression(minutes)
//       await upsertSetting(trx, "scanCronExpression", JSON.stringify(cron))
//     }
//   }

//   if (!hasCron && intervalRaw === null) {
//     await upsertSetting(trx, "scanCronExpression", "null")
//   }

//   await trx
//     .deleteFrom("settings")
//     .where("name", "=", "existingBooksScanIntervalMinutes" as never)
//     .execute()

//   // migrate metadataOverrideMode -> metadataFieldOverrides
//   const modeRaw = await getSettingValue(trx, "metadataOverrideMode")
//   const fields = [
//     "title",
//     "subtitle",
//     "description",
//     "language",
//     "publicationDate",
//     "authors",
//     "narrators",
//     "creators",
//     "series",
//     "tags",
//   ]

//   let fieldMode = "fill-empty"
//   if (modeRaw !== null) {
//     const parsed = JSON.parse(modeRaw) as string
//     if (parsed === "never") fieldMode = "skip"
//     else if (parsed === "always") fieldMode = "always"
//   }

//   const overrides = Object.fromEntries(fields.map((f) => [f, fieldMode]))
//   await upsertSetting(trx, "metadataFieldOverrides", JSON.stringify(overrides))

//   await trx
//     .deleteFrom("settings")
//     .where("name", "=", "metadataOverrideMode" as never)
//     .execute()
// }

export default async function migrate() {
  await db.transaction().execute(async (trx) => {
    await addFormatTableColumns(trx)
    await addBookTableColumns(trx)
    // await migrateSettings(trx)
  })
}
