import { type Generated, type Kysely, sql } from "kysely"

import { type ReadiumLocator } from "@/modules/readium/src/Readium.types"
import { type UUID } from "@/uuid"

export async function up(db: Kysely<DB>): Promise<void> {
  await db.schema
    .createTable("tmpPosition")
    .addColumn("uuid", "text", (col) => col.primaryKey().notNull())
    .addColumn("locator", "text", (col) => col.notNull())
    .addColumn("timestamp", "real", (col) => col.notNull())
    .addColumn("book_uuid", "text", (col) =>
      col.notNull().references("book.uuid").unique().onDelete("cascade"),
    )
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute()

  await db
    .insertInto("tmpPosition")
    .columns([
      "uuid",
      "locator",
      "timestamp",
      "bookUuid",
      "createdAt",
      "updatedAt",
    ])
    .expression((eb) =>
      eb
        .selectFrom("position")
        .select([
          "uuid",
          "locator",
          "timestamp",
          "bookUuid",
          "createdAt",
          "updatedAt",
        ]),
    )
    .execute()

  await db.schema.dropTable("position").execute()

  await db.schema.alterTable("tmpPosition").renameTo("position").execute()

  await sql`CREATE TRIGGER position_trigger AFTER
UPDATE ON position FOR EACH ROW BEGIN
UPDATE position
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;
END;
`.execute(db)
}

interface Position {
  createdAt: Generated<string>
  locator: ReadiumLocator
  timestamp: number
  bookUuid: UUID
  updatedAt: Generated<string>
  uuid: UUID
}

interface DB {
  position: Position
  tmpPosition: Position
}
