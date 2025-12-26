import AsyncStorage from "@react-native-async-storage/async-storage"
import { File } from "expo-file-system"
import * as FileSystem from "expo-file-system/legacy"
import { type ColumnType, type Kysely, sql } from "kysely"

import {
  type BookAuthor,
  type Highlight as LegacyHighlight,
  readBookIds,
  readBookmarks,
  readHighlights,
  readLocator,
} from "@/legacy/persistence/books"
import * as LegacyFiles from "@/legacy/persistence/files"
import {
  readBookPreferences,
  readGlobalPreferences,
} from "@/legacy/persistence/preferences"
import { logger } from "@/logger"
import {
  buildAudiobookManifest,
  getPositions,
  openPublication,
  parseLocalizedString,
  readiumToStorytellerAuthors,
} from "@/modules/readium"
import {
  type ReadiumLink,
  type ReadiumLocator,
  type ReadiumManifest,
  type TimestampedLocator,
} from "@/modules/readium/src/Readium.types"
import * as Files from "@/store/persistence/files"
import { listCustomFontUrls, parseCustomFont } from "@/store/persistence/fonts"
import { type UUID, randomUUID } from "@/uuid"

export async function up(db: Kysely<DB>): Promise<void> {
  await db.schema
    .createTable("server")
    .addColumn("uuid", "text", (col) => col.primaryKey().notNull())
    .addColumn("name", "text", (col) => col.defaultTo(null))
    .addColumn("base_url", "text", (col) => col.notNull())
    .addColumn("username", "text", (col) => col.defaultTo(null))
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute()

  await sql`CREATE TRIGGER server_trigger AFTER
UPDATE ON server FOR EACH ROW BEGIN
UPDATE server
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;
END;
`.execute(db)

  await db.schema
    .createTable("position")
    .addColumn("uuid", "text", (col) => col.primaryKey().notNull())
    .addColumn("locator", "text", (col) => col.notNull())
    .addColumn("timestamp", "integer", (col) => col.notNull())
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

  await sql`CREATE TRIGGER position_trigger AFTER
UPDATE ON position FOR EACH ROW BEGIN
UPDATE position
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;
END;
`.execute(db)

  await db.schema
    .createTable("status")
    .addColumn("uuid", "text", (col) => col.primaryKey().notNull())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("isDefault", "text", (col) => col.notNull())
    .addColumn("createdAt", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updatedAt", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute()

  await sql`CREATE TRIGGER status_trigger AFTER
UPDATE ON status FOR EACH ROW BEGIN
UPDATE status
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;
END;
`.execute(db)

  await db.schema
    .createTable("bookToStatus")
    .addColumn("uuid", "text", (col) => col.primaryKey().notNull())
    .addColumn("statusUuid", "text", (col) => col.notNull())
    .addColumn("bookUuid", "text", (col) => col.notNull().unique())
    .addColumn("dirty", "text", (col) => col.notNull().defaultTo("false"))
    .addColumn("createdAt", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updatedAt", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute()

  await sql`CREATE TRIGGER book_to_status_trigger AFTER
UPDATE ON book_to_status FOR EACH ROW BEGIN
UPDATE book_to_status
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;
END;
`.execute(db)

  await db.schema
    .createTable("book")
    .addColumn("uuid", "text", (col) => col.primaryKey().notNull())
    .addColumn("id", "integer")
    .addColumn("aligned_at", "text")
    .addColumn("aligned_by_storyteller_version", "text")
    .addColumn("aligned_with", "text")
    .addColumn("description", "text")
    .addColumn("language", "text")
    .addColumn("publication_date", "text")
    .addColumn("rating", "integer")
    .addColumn("subtitle", "text")
    .addColumn("suffix", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("title", "text", (col) => col.notNull())
    .addColumn("server_uuid", "text", (col) => col.references("server.uuid"))
    .addColumn("ebook_cover_url", "text")
    .addColumn("audiobook_cover_url", "text")
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute()

  await sql`CREATE TRIGGER book_trigger AFTER
UPDATE ON book FOR EACH ROW BEGIN
UPDATE book
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;
END;
`.execute(db)

  await db.schema
    .createTable("audiobook")
    .addColumn("uuid", "text", (col) => col.primaryKey().notNull())
    .addColumn("manifest", "text")
    .addColumn("download_status", "text", (col) =>
      col.notNull().defaultTo("NONE"),
    )
    .addColumn("download_progress", "integer", (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn("download_queue_position", "integer", (col) =>
      col.notNull().defaultTo(0),
    )
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

  await sql`CREATE TRIGGER audiobook_trigger AFTER
UPDATE ON audiobook FOR EACH ROW BEGIN
UPDATE audiobook
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;
END;
`.execute(db)

  await db.schema
    .createTable("ebook")
    .addColumn("uuid", "text", (col) => col.primaryKey().notNull())
    .addColumn("download_status", "text", (col) =>
      col.notNull().defaultTo("NONE"),
    )
    .addColumn("download_progress", "integer", (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn("download_queue_position", "integer", (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn("book_uuid", "text", (col) =>
      col.notNull().references("book.uuid").unique().onDelete("cascade"),
    )
    .addColumn("manifest", "text")
    .addColumn("positions", "text")
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute()

  await sql`CREATE TRIGGER ebook_trigger AFTER
UPDATE ON ebook FOR EACH ROW BEGIN
UPDATE ebook
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;
END;
`.execute(db)

  await db.schema
    .createTable("readaloud")
    .addColumn("uuid", "text", (col) => col.primaryKey().notNull())
    .addColumn("download_status", "text", (col) =>
      col.notNull().defaultTo("NONE"),
    )
    .addColumn("download_progress", "integer", (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn("download_queue_position", "integer", (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn("book_uuid", "text", (col) =>
      col.notNull().references("book.uuid").unique().onDelete("cascade"),
    )
    .addColumn("status", "text", (col) => col.notNull())
    .addColumn("audio_manifest", "text")
    .addColumn("epub_manifest", "text")
    .addColumn("positions", "text")
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute()

  await sql`CREATE TRIGGER readaloud_trigger AFTER
UPDATE ON readaloud FOR EACH ROW BEGIN
UPDATE readaloud
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;
END;
`.execute(db)

  await db.schema
    .createTable("collection")
    .addColumn("uuid", "text", (col) => col.primaryKey().notNull())
    .addColumn("description", "text")
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("public", "text", (col) => col.notNull().defaultTo("true"))
    .addColumn("serverUuid", "text", (col) => col.references("server.uuid"))
    .addColumn("createdAt", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updatedAt", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint("collection_name_server", ["name", "serverUuid"])
    .execute()

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
    .createTable("creator")
    .addColumn("uuid", "text", (col) => col.primaryKey().notNull())
    .addColumn("fileAs", "text")
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("serverUuid", "text", (col) => col.references("server.uuid"))
    .addColumn("createdAt", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updatedAt", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint("creator_name_server", ["name", "serverUuid"])
    .execute()

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
    .createTable("series")
    .addColumn("uuid", "text", (col) => col.primaryKey().notNull())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("serverUuid", "text", (col) => col.references("server.uuid"))
    .addColumn("createdAt", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updatedAt", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint("series_name_server", ["name", "serverUuid"])
    .execute()

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
    .createTable("tag")
    .addColumn("uuid", "text", (col) => col.primaryKey().notNull())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("serverUuid", "text", (col) => col.references("server.uuid"))
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint("tag_name_server", ["name", "serverUuid"])
    .execute()

  await sql`CREATE TRIGGER tag_trigger AFTER
UPDATE ON tag FOR EACH ROW BEGIN
UPDATE tag
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;
END;
`.execute(db)

  await db.schema
    .createTable("bookToCollection")
    .addColumn("uuid", "text", (col) => col.primaryKey().notNull())
    .addColumn("book_uuid", "text", (col) =>
      col.notNull().references("book.uuid").onDelete("cascade"),
    )
    .addColumn("collection_uuid", "text", (col) =>
      col.notNull().references("collection.uuid").onDelete("cascade"),
    )
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint("book_to_collection_book_uuid_collection_uuid", [
      "book_uuid",
      "collection_uuid",
    ])
    .execute()

  await sql`CREATE TRIGGER book_to_collection_trigger AFTER
UPDATE ON book_to_collection FOR EACH ROW BEGIN
UPDATE book_to_collection
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;
END;
`.execute(db)

  await db.schema
    .createTable("bookToCreator")
    .addColumn("uuid", "text", (col) => col.primaryKey().notNull())
    .addColumn("book_uuid", "text", (col) =>
      col.notNull().references("book.uuid").onDelete("cascade"),
    )
    .addColumn("creator_uuid", "text", (col) =>
      col.notNull().references("creator.uuid").onDelete("cascade"),
    )
    .addColumn("role", "text")
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint("book_to_creator_book_uuid_creator_uuid", [
      "book_uuid",
      "creator_uuid",
    ])
    .execute()

  await sql`CREATE TRIGGER book_to_creator_trigger AFTER
UPDATE ON book_to_creator FOR EACH ROW BEGIN
UPDATE book_to_creator
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;
END;
`.execute(db)

  await db.schema
    .createTable("bookToSeries")
    .addColumn("uuid", "text", (col) => col.primaryKey().notNull())
    .addColumn("book_uuid", "text", (col) =>
      col.notNull().references("book.uuid").onDelete("cascade"),
    )
    .addColumn("series_uuid", "text", (col) =>
      col.notNull().references("series.uuid").onDelete("cascade"),
    )
    .addColumn("featured", "text", (col) => col.notNull().defaultTo("true"))
    .addColumn("position", "real")
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint("book_to_series_book_uuid_series_uuid", [
      "book_uuid",
      "series_uuid",
    ])
    .execute()

  await sql`CREATE TRIGGER book_to_series_trigger AFTER
UPDATE ON book_to_series FOR EACH ROW BEGIN
UPDATE book_to_series
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;
END;
`.execute(db)

  await db.schema
    .createTable("bookToTag")
    .addColumn("uuid", "text", (col) => col.primaryKey().notNull())
    .addColumn("book_uuid", "text", (col) =>
      col.notNull().references("book.uuid").onDelete("cascade"),
    )
    .addColumn("tag_uuid", "text", (col) =>
      col.notNull().references("tag.uuid").onDelete("cascade"),
    )
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint("book_to_tag_book_uuid_tag_uuid", [
      "book_uuid",
      "tag_uuid",
    ])
    .execute()

  await sql`CREATE TRIGGER book_to_tag_trigger AFTER
UPDATE ON book_to_tag FOR EACH ROW BEGIN
UPDATE book_to_tag
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;
END;
`.execute(db)

  await db.schema
    .createTable("bookPreferences")
    .addColumn("uuid", "text", (col) => col.primaryKey().notNull())
    .addColumn("book_uuid", "text", (col) =>
      col.notNull().references("book.uuid").onDelete("cascade"),
    )
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("value", "text", (col) => col.notNull())
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint("book_preferences_book_uuid_name", [
      "book_uuid",
      "name",
    ])
    .execute()

  await sql`CREATE TRIGGER book_preferences_trigger AFTER
UPDATE ON book_preferences FOR EACH ROW BEGIN
UPDATE book_preferences
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;
END;
`.execute(db)

  await db.schema
    .createTable("preferences")
    .addColumn("uuid", "text", (col) => col.primaryKey().notNull())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("value", "text", (col) => col.notNull())
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute()

  await sql`CREATE TRIGGER preferences_trigger AFTER
UPDATE ON preferences FOR EACH ROW BEGIN
UPDATE preferences
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;
END;
`.execute(db)

  await db.schema
    .createTable("highlight")
    .addColumn("uuid", "text", (col) => col.primaryKey().notNull())
    .addColumn("book_uuid", "text", (col) =>
      col.notNull().references("book.uuid").onDelete("cascade"),
    )
    .addColumn("color", "text", (col) => col.notNull())
    .addColumn("locator", "text", (col) => col.notNull())
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute()

  await sql`CREATE TRIGGER highlight_trigger AFTER
UPDATE ON highlight FOR EACH ROW BEGIN
UPDATE highlight
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;
END;
`.execute(db)

  await db.schema
    .createTable("bookmark")
    .addColumn("uuid", "text", (col) => col.primaryKey().notNull())
    .addColumn("book_uuid", "text", (col) =>
      col.notNull().references("book.uuid").onDelete("cascade"),
    )
    .addColumn("locator", "text", (col) => col.notNull())
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute()

  await sql`CREATE TRIGGER bookmark_trigger AFTER
UPDATE ON bookmark FOR EACH ROW BEGIN
UPDATE bookmark
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;
END;
`.execute(db)

  await db.schema
    .createIndex("indexBookToCreatorBookRole")
    .on("bookToCreator")
    .columns(["bookUuid", "role"])
    .execute()

  await db.schema
    .createIndex("indexBookToSeriesBook")
    .on("bookToSeries")
    .columns(["bookUuid"])
    .execute()

  await db.schema
    .createIndex("indexBookToTagBook")
    .on("bookToTag")
    .columns(["bookUuid"])
    .execute()

  await db.schema
    .createIndex("indexEbookBook")
    .on("ebook")
    .columns(["bookUuid"])
    .execute()

  await db.schema
    .createIndex("indexAudiobookBook")
    .on("audiobook")
    .columns(["bookUuid"])
    .execute()

  await db.schema
    .createIndex("indexReadaloudBook")
    .on("readaloud")
    .columns(["bookUuid"])
    .execute()

  const preferences = await readGlobalPreferences()
  if (preferences) {
    for (const [name, value] of Object.entries(preferences)) {
      await db
        .insertInto("preferences")
        .values({
          uuid: randomUUID(),
          name: name as keyof import("@/database/preferencesTypes").Preferences,
          value: JSON.stringify(value),
        })
        .execute()
    }
  }

  const customFontUrls = await listCustomFontUrls()
  const customFonts = customFontUrls.map(parseCustomFont)

  await db
    .insertInto("preferences")
    .values({
      uuid: randomUUID(),
      name: "customFonts",
      value: JSON.stringify(customFonts),
    })
    .execute()

  await db
    .insertInto("status")
    .values({
      uuid: randomUUID(),
      name: "To read",
      isDefault: true,
    })
    .returning("uuid as uuid")
    .execute()

  const reading = await db
    .insertInto("status")
    .values({
      uuid: randomUUID(),
      name: "Reading",
      isDefault: false,
    })
    .returning("uuid as uuid")
    .executeTakeFirstOrThrow()

  const read = await db
    .insertInto("status")
    .values({
      uuid: randomUUID(),
      name: "Read",
      isDefault: false,
    })
    .returning("uuid as uuid")
    .executeTakeFirstOrThrow()

  const serverBaseUrl = await AsyncStorage.getItem("st_api_base_url")

  let serverUuid: UUID | null = null
  if (serverBaseUrl) {
    ;({ uuid: serverUuid } = await db
      .insertInto("server")
      .values({
        uuid: randomUUID(),
        baseUrl: new URL(serverBaseUrl).origin,
      })
      .returning(["uuid as uuid"])
      .executeTakeFirstOrThrow())
  }

  const bookIds = (await readBookIds()) ?? []

  const books: {
    id: number
    title: string
    authors: BookAuthor[]
    epubManifest: ReadiumManifest
    audioManifest: ReadiumManifest
    positions: ReadiumLink[]
    highlights: LegacyHighlight[]
    bookmarks: ReadiumLocator[]
    locator: TimestampedLocator | null
  }[] = []

  for (const bookId of bookIds) {
    const extractedPath = LegacyFiles.getLocalBookExtractedUrl(bookId)
    const epubManifest = await openPublication(
      bookId.toString() as UUID,
      extractedPath,
    )
    const audioManifest = await buildAudiobookManifest(
      bookId.toString() as UUID,
    )
    const positions = await getPositions(bookId.toString() as UUID)
    const bookmarks = await readBookmarks(bookId)
    const highlights = await readHighlights(bookId)
    const locator = await readLocator(bookId)

    books.push({
      id: bookId,
      title: parseLocalizedString(epubManifest.metadata.title),
      authors: readiumToStorytellerAuthors(epubManifest.metadata.author),
      epubManifest,
      audioManifest,
      positions,
      highlights,
      bookmarks,
      locator,
    })
  }

  for (const book of books) {
    let publicationDate: string | null = null
    try {
      if (book.epubManifest.metadata.published) {
        publicationDate = new Date(
          book.epubManifest.metadata.published,
        ).toISOString()
      }
    } catch {
      // pass
    }

    const dbBook = await db
      .insertInto("book")
      .values({
        uuid: randomUUID(),
        id: book.id,
        title: book.title,
        subtitle: book.epubManifest.metadata.subtitle
          ? parseLocalizedString(book.epubManifest.metadata.subtitle)
          : null,
        description: book.epubManifest.metadata.description
          ? parseLocalizedString(book.epubManifest.metadata.description)
          : null,
        language: book.epubManifest.metadata.language,
        publicationDate,
        serverUuid,
        ebookCoverUrl: LegacyFiles.getLocalBookCoverUrl(book.id),
        audiobookCoverUrl: LegacyFiles.getLocalAudioBookCoverUrl(book.id),
      })
      .returning("uuid as uuid")
      .executeTakeFirstOrThrow()

    await db
      .insertInto("bookToStatus")
      .values({
        uuid: randomUUID(),
        bookUuid: dbBook.uuid,
        statusUuid:
          book.locator?.locator.locations?.totalProgression &&
          book.locator?.locator.locations?.totalProgression > 0.98
            ? read.uuid
            : reading.uuid,
      })
      .execute()

    try {
      const localBookArchiveUri = Files.getLocalBookArchiveUrl(
        dbBook.uuid,
        "readaloud",
      )
      new File(localBookArchiveUri).parentDirectory.create({
        idempotent: true,
        intermediates: true,
      })
      await FileSystem.moveAsync({
        from: LegacyFiles.getLocalBookArchiveUrl(book.id),
        to: localBookArchiveUri,
      })
    } catch (e) {
      logger.error("Failed to move archive, skipping")
      logger.error(e)
    }

    try {
      const localBookExtractedUri = Files.getLocalBookExtractedUrl(
        dbBook.uuid,
        "readaloud",
      )
      new File(localBookExtractedUri).parentDirectory.create({
        idempotent: true,
        intermediates: true,
      })
      await FileSystem.moveAsync({
        from: LegacyFiles.getLocalBookExtractedUrl(book.id),
        to: localBookExtractedUri,
      })
    } catch (e) {
      logger.error("Failed to move extracted book, skipping")
      logger.error(e)
    }

    await db
      .insertInto("readaloud")
      .values({
        uuid: randomUUID(),
        bookUuid: dbBook.uuid,
        downloadStatus: "DOWNLOADED",
        downloadProgress: 100,
        status: "ALIGNED",
        epubManifest: JSON.stringify(
          book.epubManifest,
        ) as unknown as ReadiumManifest,
        audioManifest: JSON.stringify(
          book.audioManifest,
        ) as unknown as ReadiumManifest,
        positions: JSON.stringify(
          book.positions,
        ) as unknown as ReadiumLocator[],
      })
      .execute()

    const preferences = await readBookPreferences(book.id)
    if (preferences) {
      for (const [name, value] of Object.entries(preferences)) {
        await db
          .insertInto("bookPreferences")
          .values({
            uuid: randomUUID(),
            bookUuid: dbBook.uuid,
            name: name as keyof import("@/database/preferencesTypes").BookPreferences,
            value: JSON.stringify(value),
          })
          .execute()
      }
    }

    for (const author of book.authors) {
      const creator = await db
        .insertInto("creator")
        .values({
          uuid: randomUUID(),
          name: author.name,
          fileAs: author.file_as,
        })
        .returning("uuid as uuid")
        .executeTakeFirstOrThrow()

      await db
        .insertInto("bookToCreator")
        .values({
          uuid: randomUUID(),
          bookUuid: dbBook.uuid,
          creatorUuid: creator.uuid,
          role: "aut",
        })
        .execute()
    }

    const seriesMd = book.epubManifest.metadata.belongsTo?.series ?? []
    const series = Array.isArray(seriesMd) ? seriesMd : [seriesMd]

    for (const sc of series) {
      const s = typeof sc === "string" ? { name: sc } : sc
      const dbSeries = await db
        .insertInto("series")
        .values({
          uuid: randomUUID(),
          name: parseLocalizedString(s.name),
        })
        .returning("uuid as uuid")
        .executeTakeFirstOrThrow()

      await db
        .insertInto("bookToSeries")
        .values({
          uuid: randomUUID(),
          bookUuid: dbBook.uuid,
          seriesUuid: dbSeries.uuid,
          position: s.position,
          featured: true,
        })
        .execute()
    }

    const tags = book.epubManifest.metadata.subject ?? []
    for (const t of tags) {
      const tag = typeof t === "string" ? { name: t } : t
      const dbTag = await db
        .insertInto("tag")
        .values({ uuid: randomUUID(), name: parseLocalizedString(tag.name) })
        .returning("uuid as uuid")
        .executeTakeFirstOrThrow()

      await db
        .insertInto("bookToTag")
        .values({
          uuid: randomUUID(),
          bookUuid: dbBook.uuid,
          tagUuid: dbTag.uuid,
        })
        .execute()
    }

    for (const highlight of book.highlights) {
      await db
        .insertInto("highlight")
        .values({
          bookUuid: dbBook.uuid,
          color: highlight.color,
          locator: highlight.locator,
          uuid: randomUUID(),
        })
        .execute()
    }

    for (const bookmark of book.bookmarks) {
      await db
        .insertInto("bookmark")
        .values({
          uuid: randomUUID(),
          bookUuid: dbBook.uuid,
          locator: bookmark,
        })
        .execute()
    }

    if (book.locator) {
      await db
        .insertInto("position")
        .values({
          uuid: randomUUID(),
          timestamp: book.locator.timestamp,
          locator: JSON.stringify(
            book.locator.locator,
          ) as unknown as ReadiumLocator,
          bookUuid: dbBook.uuid,
        })
        .execute()
    }
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("indexBookToCreatorBookRole").ifExists().execute()
  await db.schema.dropIndex("indexBookToSeriesBook").ifExists().execute()
  await db.schema.dropIndex("indexBookToTagBook").ifExists().execute()
  await db.schema.dropIndex("indexEbookBook").ifExists().execute()
  await db.schema.dropIndex("indexAudiobookBook").ifExists().execute()
  await db.schema.dropIndex("indexReadaloudBook").ifExists().execute()

  await db.schema.dropTable("bookPreferences").ifExists().execute()
  await db.schema.dropTable("bookmark").ifExists().execute()
  await db.schema.dropTable("highlight").ifExists().execute()
  await db.schema.dropTable("preferences").ifExists().execute()
  await db.schema.dropTable("bookToTag").ifExists().execute()
  await db.schema.dropTable("bookToSeries").ifExists().execute()
  await db.schema.dropTable("bookToStatus").ifExists().execute()
  await db.schema.dropTable("bookToCreator").ifExists().execute()
  await db.schema.dropTable("bookToCollection").ifExists().execute()
  await db.schema.dropTable("tag").ifExists().execute()
  await db.schema.dropTable("series").ifExists().execute()
  await db.schema.dropTable("creator").ifExists().execute()
  await db.schema.dropTable("collection").ifExists().execute()
  await db.schema.dropTable("readaloud").ifExists().execute()
  await db.schema.dropTable("ebook").ifExists().execute()
  await db.schema.dropTable("audiobook").ifExists().execute()
  await db.schema.dropTable("book").ifExists().execute()
  await db.schema.dropTable("status").ifExists().execute()
  await db.schema.dropTable("position").ifExists().execute()
  await db.schema.dropTable("server").ifExists().execute()
}

/** Snapshot of schema after creating tables in `up` */

export type Generated<T> =
  T extends ColumnType<infer S, infer I, infer U>
    ? ColumnType<S, I | undefined, U>
    : ColumnType<T, T | undefined, T>

export interface Audiobook {
  bookUuid: UUID
  manifest: ReadiumManifest | null
  downloadStatus: Generated<
    "NONE" | "QUEUED" | "PAUSED" | "DOWNLOADING" | "ERROR" | "DOWNLOADED"
  >
  downloadProgress: Generated<number>
  downloadQueuePosition: Generated<number>
  createdAt: Generated<string>
  updatedAt: Generated<string>
  uuid: UUID
}

export interface Book {
  alignedAt: string | null
  alignedByStorytellerVersion: string | null
  alignedWith: string | null
  createdAt: Generated<string>
  description: string | null
  id: number | null
  language: Generated<string | null>
  publicationDate: string | null
  rating: number | null
  subtitle: string | null
  suffix: Generated<string>
  title: string
  serverUuid: UUID | null
  ebookCoverUrl: string | null
  audiobookCoverUrl: string | null
  updatedAt: Generated<string>
  uuid: UUID
}

export interface Bookmark {
  uuid: UUID
  bookUuid: UUID
  locator: ReadiumLocator
  createdAt: Generated<string>
  updatedAt: Generated<string>
}

export interface BookPreferences {
  uuid: UUID
  bookUuid: UUID
  name: keyof import("@/database/preferencesTypes").BookPreferences
  value: string
  createdAt: Generated<string>
  updatedAt: Generated<string>
}

export interface BookToCollection {
  bookUuid: UUID
  collectionUuid: UUID
  createdAt: Generated<string>
  updatedAt: Generated<string>
  uuid: UUID
}

export interface BookToCreator {
  bookUuid: UUID
  createdAt: Generated<string>
  creatorUuid: UUID
  role:
    | import("@storyteller-platform/web/src/components/books/edit/marcRelators").Role
    | null
  updatedAt: Generated<string>
  uuid: UUID
}

export interface BookToSeries {
  bookUuid: UUID
  createdAt: Generated<string>
  featured: Generated<boolean>
  position: number | null
  seriesUuid: UUID
  updatedAt: Generated<string>
  uuid: UUID
}

export interface BookToStatus {
  bookUuid: UUID
  createdAt: Generated<string>
  statusUuid: UUID
  updatedAt: Generated<string>
  dirty: Generated<boolean>
  uuid: UUID
}

export interface BookToTag {
  bookUuid: UUID
  createdAt: Generated<string>
  tagUuid: UUID
  updatedAt: Generated<string>
  uuid: UUID
}

export interface Collection {
  createdAt: Generated<string>
  description: string | null
  name: string
  public: Generated<boolean>
  serverUuid: UUID | null
  updatedAt: Generated<string>
  uuid: UUID
}

export interface Creator {
  createdAt: Generated<string>
  fileAs: string
  name: string
  serverUuid: UUID | null
  updatedAt: Generated<string>
  uuid: UUID
}

export interface Ebook {
  bookUuid: UUID
  downloadStatus: Generated<
    "NONE" | "QUEUED" | "PAUSED" | "DOWNLOADING" | "ERROR" | "DOWNLOADED"
  >
  downloadProgress: Generated<number>
  downloadQueuePosition: Generated<number>
  manifest: ReadiumManifest | null
  positions: ReadiumLocator[] | null
  createdAt: Generated<string>
  updatedAt: Generated<string>
  uuid: UUID
}

export interface Highlight {
  uuid: UUID
  bookUuid: UUID
  color: string
  locator: ReadiumLocator
  createdAt: Generated<string>
  updatedAt: Generated<string>
}

export interface Position {
  createdAt: Generated<string>
  locator: ReadiumLocator
  timestamp: number
  bookUuid: UUID
  updatedAt: Generated<string>
  uuid: UUID
}

export interface Readaloud {
  bookUuid: UUID
  downloadStatus: Generated<
    "NONE" | "QUEUED" | "PAUSED" | "DOWNLOADING" | "ERROR" | "DOWNLOADED"
  >
  downloadProgress: Generated<number>
  downloadQueuePosition: Generated<number>
  audioManifest: ReadiumManifest | null
  epubManifest: ReadiumManifest | null
  positions: ReadiumLocator[] | null
  createdAt: Generated<string>
  status: Generated<
    "CREATED" | "QUEUED" | "PROCESSING" | "STOPPED" | "ERROR" | "ALIGNED"
  >
  updatedAt: Generated<string>
  uuid: UUID
}

export interface Series {
  createdAt: Generated<string>
  name: string
  updatedAt: Generated<string>
  serverUuid: UUID | null
  uuid: UUID
}

export interface Server {
  createdAt: Generated<string>
  name: Generated<string | null>
  baseUrl: string
  username: Generated<string | null>
  updatedAt: Generated<string>
  uuid: UUID
}

export interface Preferences {
  createdAt: Generated<string>
  id: number | null
  name: keyof import("@/database/preferencesTypes").Preferences
  updatedAt: Generated<string>
  uuid: UUID
  value: string
}

export interface Status {
  createdAt: Generated<string>
  isDefault: Generated<boolean>
  name: string
  updatedAt: Generated<string>
  uuid: UUID
}

export interface Tag {
  createdAt: Generated<string>
  name: string
  serverUuid: UUID | null
  updatedAt: Generated<string>
  uuid: UUID
}

export interface DB {
  audiobook: Audiobook
  book: Book
  bookmark: Bookmark
  bookPreferences: BookPreferences
  bookToCollection: BookToCollection
  bookToCreator: BookToCreator
  bookToSeries: BookToSeries
  bookToStatus: BookToStatus
  bookToTag: BookToTag
  collection: Collection
  creator: Creator
  ebook: Ebook
  highlight: Highlight
  position: Position
  preferences: Preferences
  readaloud: Readaloud
  series: Series
  server: Server
  status: Status
  tag: Tag
}
