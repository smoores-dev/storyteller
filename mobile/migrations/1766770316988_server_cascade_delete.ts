import { type Generated, type Kysely, sql } from "kysely"

import { type UUID } from "@/uuid"

export async function up(db: Kysely<DB>): Promise<void> {
  await sql`PRAGMA foreign_keys=0`.execute(db)
  try {
    await db.schema
      .createTable("tmpCollection")
      .addColumn("uuid", "text", (col) => col.primaryKey().notNull())
      .addColumn("description", "text")
      .addColumn("name", "text", (col) => col.notNull())
      .addColumn("public", "text", (col) => col.notNull().defaultTo("true"))
      .addColumn("serverUuid", "text", (col) =>
        col.references("server.uuid").onDelete("cascade"),
      )
      .addColumn("createdAt", "text", (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addColumn("updatedAt", "text", (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addUniqueConstraint("collection_name_server", ["name", "serverUuid"])
      .execute()

    await db
      .insertInto("tmpCollection")
      .columns([
        "uuid",
        "description",
        "name",
        "public",
        "serverUuid",
        "createdAt",
        "updatedAt",
      ])
      .expression((eb) =>
        eb
          .selectFrom("collection")
          .select([
            "uuid",
            "description",
            "name",
            "public",
            "serverUuid",
            "createdAt",
            "updatedAt",
          ]),
      )
      .execute()

    await db.schema.dropTable("collection").execute()

    await db.schema.alterTable("tmpCollection").renameTo("collection").execute()

    await sql`CREATE TRIGGER collection_trigger AFTER
UPDATE ON collection FOR EACH ROW BEGIN
UPDATE collection
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;
END;
`.execute(db)

    await db.schema
      .createTable("tmpCreator")
      .addColumn("uuid", "text", (col) => col.primaryKey().notNull())
      .addColumn("fileAs", "text")
      .addColumn("name", "text", (col) => col.notNull())
      .addColumn("serverUuid", "text", (col) =>
        col.references("server.uuid").onDelete("cascade"),
      )
      .addColumn("createdAt", "text", (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addColumn("updatedAt", "text", (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addUniqueConstraint("creator_name_server", ["name", "serverUuid"])
      .execute()

    await db
      .insertInto("tmpCreator")
      .columns([
        "uuid",
        "fileAs",
        "name",
        "serverUuid",
        "createdAt",
        "updatedAt",
      ])
      .expression((eb) =>
        eb
          .selectFrom("creator")
          .select([
            "uuid",
            "fileAs",
            "name",
            "serverUuid",
            "createdAt",
            "updatedAt",
          ]),
      )
      .execute()

    await db.schema.dropTable("creator").execute()

    await db.schema.alterTable("tmpCreator").renameTo("creator").execute()

    await sql`CREATE TRIGGER creator_trigger AFTER
UPDATE ON creator FOR EACH ROW BEGIN
UPDATE creator
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;
END;
`.execute(db)

    await db.schema
      .createTable("tmpSeries")
      .addColumn("uuid", "text", (col) => col.primaryKey().notNull())
      .addColumn("name", "text", (col) => col.notNull())
      .addColumn("serverUuid", "text", (col) =>
        col.references("server.uuid").onDelete("cascade"),
      )
      .addColumn("createdAt", "text", (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addColumn("updatedAt", "text", (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addUniqueConstraint("series_name_server", ["name", "serverUuid"])
      .execute()

    await db
      .insertInto("tmpSeries")
      .columns(["uuid", "name", "serverUuid", "createdAt", "updatedAt"])
      .expression((eb) =>
        eb
          .selectFrom("series")
          .select(["uuid", "name", "serverUuid", "createdAt", "updatedAt"]),
      )
      .execute()

    await db.schema.dropTable("series").execute()

    await db.schema.alterTable("tmpSeries").renameTo("series").execute()

    await sql`CREATE TRIGGER series_trigger AFTER
UPDATE ON series FOR EACH ROW BEGIN
UPDATE series
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;
END;
`.execute(db)

    await db.schema
      .createTable("tmpTag")
      .addColumn("uuid", "text", (col) => col.primaryKey().notNull())
      .addColumn("name", "text", (col) => col.notNull())
      .addColumn("serverUuid", "text", (col) =>
        col.references("server.uuid").onDelete("cascade"),
      )
      .addColumn("created_at", "text", (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addColumn("updated_at", "text", (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addUniqueConstraint("tag_name_server", ["name", "serverUuid"])
      .execute()

    await db
      .insertInto("tmpTag")
      .columns(["uuid", "name", "serverUuid", "createdAt", "updatedAt"])
      .expression((eb) =>
        eb
          .selectFrom("tag")
          .select(["uuid", "name", "serverUuid", "createdAt", "updatedAt"]),
      )
      .execute()

    await db.schema.dropTable("tag").execute()

    await db.schema.alterTable("tmpTag").renameTo("tag").execute()

    await sql`CREATE TRIGGER tag_trigger AFTER
UPDATE ON tag FOR EACH ROW BEGIN
UPDATE tag
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;
END;
`.execute(db)
  } finally {
    await sql`PRAGMA foreign_keys=1`.execute(db)
  }
}

interface Collection {
  createdAt: Generated<string>
  description: string | null
  name: string
  public: Generated<boolean>
  serverUuid: UUID | null
  updatedAt: Generated<string>
  uuid: UUID
}

interface Creator {
  createdAt: Generated<string>
  fileAs: string
  name: string
  serverUuid: UUID | null
  updatedAt: Generated<string>
  uuid: UUID
}

interface Series {
  createdAt: Generated<string>
  name: string
  updatedAt: Generated<string>
  serverUuid: UUID | null
  uuid: UUID
}

interface Tag {
  createdAt: Generated<string>
  name: string
  serverUuid: UUID | null
  updatedAt: Generated<string>
  uuid: UUID
}

interface DB {
  collection: Collection
  tmpCollection: Collection
  creator: Creator
  tmpCreator: Creator
  series: Series
  tmpSeries: Series
  tag: Tag
  tmpTag: Tag
}
