import * as legacyPaths from "@/assets/legacy/paths"
import * as paths from "@/assets/paths"
import * as legacyCovers from "@/assets/legacy/covers"
import { mkdirSync, renameSync, rmdirSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { db } from "../connection"
import { logger } from "@/logging"
import {
  ASSETS_DIR,
  AUDIO_DIR,
  CACHE_DIR,
  DATA_DIR,
  TEXT_DIR,
} from "@/directories"
import { jsonArrayFrom, jsonObjectFrom } from "kysely/helpers/sqlite"

async function getBooks() {
  return await db
    .selectFrom("book")
    .selectAll("book")
    .select((eb) => [
      jsonArrayFrom(
        eb
          .selectFrom("author")
          .innerJoin("authorToBook", "authorToBook.authorUuid", "author.uuid")
          .select([
            "author.uuid",
            "author.id",
            "author.name",
            "author.fileAs",
            "authorToBook.role",
            "author.createdAt",
            "author.updatedAt",
          ])
          .whereRef("authorToBook.bookUuid", "=", "book.uuid"),
      ).as("authors"),
      jsonArrayFrom(
        eb
          .selectFrom("series")
          .innerJoin("bookToSeries", "bookToSeries.seriesUuid", "series.uuid")
          .select([
            "series.uuid",
            "series.name",
            "bookToSeries.featured",
            "bookToSeries.position",
            "series.createdAt",
            "series.updatedAt",
          ])
          .whereRef("bookToSeries.bookUuid", "=", "book.uuid"),
      ).as("series"),
      jsonArrayFrom(
        eb
          .selectFrom("tag")
          .innerJoin("bookToTag", "bookToTag.tagUuid", "tag.uuid")
          .select(["tag.uuid", "tag.name", "tag.createdAt", "tag.updatedAt"])
          .whereRef("bookToTag.bookUuid", "=", "book.uuid"),
      ).as("tags"),
      jsonArrayFrom(
        eb
          .selectFrom("collection")
          .innerJoin(
            "bookToCollection",
            "bookToCollection.collectionUuid",
            "collection.uuid",
          )
          .select([
            "collection.uuid",
            "collection.name",
            "collection.description",
            "collection.public",
            "collection.createdAt",
            "collection.updatedAt",
          ])
          .whereRef("bookToCollection.bookUuid", "=", "book.uuid"),
      ).as("collections"),
      jsonObjectFrom(
        eb
          .selectFrom("processingTask")
          .select([
            "processingTask.uuid",
            "processingTask.progress",
            "processingTask.status",
            "processingTask.type",
            "processingTask.createdAt",
            "processingTask.updatedAt",
          ])
          .whereRef("processingTask.bookUuid", "=", "book.uuid")
          .orderBy("processingTask.updatedAt", "desc")
          .limit(1),
      ).as("processingTask"),
      jsonObjectFrom(
        eb
          .selectFrom("status")
          .select([
            "status.uuid",
            "status.name",
            "status.createdAt",
            "status.updatedAt",
          ])
          .whereRef("status.uuid", "=", "book.statusUuid"),
      ).as("status"),
      jsonObjectFrom(
        eb
          .selectFrom("ebook")
          .select([
            "ebook.uuid",
            "ebook.filepath",
            "ebook.createdAt",
            "ebook.updatedAt",
          ])
          .whereRef("ebook.bookUuid", "=", "book.uuid"),
      ).as("ebook"),
      jsonObjectFrom(
        eb
          .selectFrom("audiobook")
          .select([
            "audiobook.uuid",
            "audiobook.filepath",
            "audiobook.createdAt",
            "audiobook.updatedAt",
          ])
          .whereRef("audiobook.bookUuid", "=", "book.uuid"),
      ).as("audiobook"),
      jsonObjectFrom(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call
        eb
          // @ts-expect-error This is the name for this table during this migration
          .selectFrom("alignedBook")
          // @ts-expect-error This is the name for this table during this migration
          .select([
            "alignedBook.uuid",
            "alignedBook.filepath",
            "alignedBook.status",
            "alignedBook.createdAt",
            "alignedBook.updatedAt",
          ])
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          .whereRef("alignedBook.bookUuid", "=", "book.uuid"),
      ).as("alignedBook"),
    ])
    .execute()
}

export default async function migrate() {
  logger.info("Migrating to new directory structure! Welcome to v2!")

  mkdirSync(ASSETS_DIR, { recursive: true })

  const books = await getBooks()

  for (const book of books) {
    logger.info(`Migrating ${book.title}…`)

    let newBookDir = paths.getInternalBookDirectory(book)
    try {
      mkdirSync(newBookDir)
      logger.info(`Created parent new folder: ${newBookDir}`)
    } catch (e) {
      if (e instanceof Error && "code" in e && e.code === "EEXIST") {
        await db
          .updateTable("book")
          .set({
            suffix: paths.getDefaultSuffix(book.uuid),
          })
          .where("uuid", "=", book.uuid)
          .execute()

        book.suffix = paths.getDefaultSuffix(book.uuid)

        newBookDir = paths.getInternalBookDirectory(book)
        try {
          mkdirSync(newBookDir)
          logger.info(`Created parent new folder: ${newBookDir}`)
        } catch (e) {
          logger.error(
            `Failed to create parent folder for book ${book.title} (${book.uuid})`,
          )
          logger.error(e)
          continue
        }
      } else {
        logger.error(
          `Failed to create parent folder for book ${book.title} (${book.uuid})`,
        )
        logger.error(e)
        continue
      }
    }

    try {
      mkdirSync(paths.getInternalEpubDirectory(book))

      const legacyEpubFilepath = legacyPaths.getEpubFilepath(book.uuid)
      const newEpubFilepath = paths.getInternalEpubFilepath(book)
      renameSync(legacyEpubFilepath, newEpubFilepath)

      await db
        .updateTable("ebook")
        .set({
          filepath: newEpubFilepath,
        })
        .where("bookUuid", "=", book.uuid)
        .execute()

      logger.info("Migrated original ebook")
    } catch (e) {
      if (e instanceof Error && "code" in e && e.code === "ENOENT") {
        logger.info("Skipped original ebook (missing)")
      } else {
        logger.error(`Failed to migrate original ebook`)
        logger.error(e)
      }
    }

    try {
      const legacyAudioDir = legacyPaths.getOriginalAudioFilepath(book.uuid)
      const newAudioDir = paths.getInternalAudioDirectory(book)
      renameSync(legacyAudioDir, newAudioDir)

      await db
        .updateTable("audiobook")
        .set({
          filepath: newAudioDir,
        })
        .where("bookUuid", "=", book.uuid)
        .execute()

      logger.info("Migrated original audio files")
    } catch (e) {
      if (e instanceof Error && "code" in e && e.code === "ENOENT") {
        logger.info("Skipped original audio files (missing)")
      } else {
        logger.error(`Failed to migrate original audio files`)
        logger.error(e)
      }
    }

    try {
      const legacyTranscodedAudioDir = legacyPaths.getProcessedAudioFilepath(
        book.uuid,
      )
      const newTranscodedAudioDir = paths.getProcessedAudioFilepath(book)
      renameSync(legacyTranscodedAudioDir, newTranscodedAudioDir)

      logger.info("Migrated transcoded/split audio files")
    } catch (e) {
      if (e instanceof Error && "code" in e && e.code === "ENOENT") {
        logger.info("Skipped transcoded/split audio files (missing)")
      } else {
        logger.error(`Failed to migrate transcoded/split audio files`)
        logger.error(e)
      }
    }

    try {
      const legacyTranscriptionsDir = legacyPaths.getTranscriptionsFilepath(
        book.uuid,
      )
      const newTranscriptionsDir = paths.getTranscriptionsFilepath(book)
      renameSync(legacyTranscriptionsDir, newTranscriptionsDir)

      logger.info("Migrated transcriptions")
    } catch (e) {
      if (e instanceof Error && "code" in e && e.code === "ENOENT") {
        logger.info("Skipped transcriptions (missing)")
      } else {
        logger.error(`Failed to migrate transcriptions`)
        logger.error(e)
      }
    }

    try {
      mkdirSync(paths.getInternalEpubAlignedDirectory(book))

      const legacyAlignedDir = legacyPaths.getEpubAlignedFilepath(book.uuid)
      const newAlignedDir = paths.getInternalEpubAlignedFilepath(book)
      renameSync(legacyAlignedDir, newAlignedDir)

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      await db
        // @ts-expect-error This was briefly named aligned_book
        .updateTable("alignedBook")
        // @ts-expect-error This was briefly named aligned_book
        .set({
          status: "ALIGNED",
          filepath: newAlignedDir,
        })
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        .where("bookUuid", "=", book.uuid)
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        .execute()

      logger.info("Migrated aligned ebook")
    } catch (e) {
      if (e instanceof Error && "code" in e && e.code === "ENOENT") {
        logger.info("Skipped aligned ebook (missing)")
      } else {
        logger.error(`Failed to migrate aligned ebook`)
        logger.error(e)
      }
    }

    try {
      const legacyEpubCover = await legacyCovers.getEpubCoverFilepath(book.uuid)
      const epubCoverName = await legacyCovers.getEpubCoverFilename(book.uuid)
      if (legacyEpubCover && epubCoverName) {
        renameSync(
          legacyEpubCover,
          join(paths.getInternalEpubDirectory(book), epubCoverName),
        )
      }

      logger.info("Migrated ebook cover")
    } catch (e) {
      if (e instanceof Error && "code" in e && e.code === "ENOENT") {
        logger.info("Skipped ebook cover (missing)")
      } else {
        logger.error(`Failed to migrate ebook cover`)
        logger.error(e)
      }
    }

    try {
      const legacyAudioCover = await legacyCovers.getAudioCoverFilepath(
        book.uuid,
      )
      const audioCoverName = await legacyCovers.getAudioCoverFilename(book.uuid)
      if (legacyAudioCover && audioCoverName) {
        renameSync(
          legacyAudioCover,
          join(paths.getInternalAudioDirectory(book), audioCoverName),
        )
      }

      logger.info("Migrated audio cover")
    } catch (e) {
      if (e instanceof Error && "code" in e && e.code === "ENOENT") {
        logger.info("Skipped audio cover (missing)")
      } else {
        logger.error(`Failed to migrate audio cover`)
        logger.error(e)
      }
    }

    try {
      const legacyEpubIndex = legacyPaths.getEpubIndexPath(book.uuid)
      rmSync(legacyEpubIndex)

      logger.info("Deleted ebook index file")
    } catch (e) {
      if (e instanceof Error && "code" in e && e.code === "ENOENT") {
        logger.info("Skipped ebook index file (missing)")
      } else {
        logger.error(`Failed to delete ebook index file`)
        logger.error(e)
      }
    }

    try {
      const legacyAudioIndex = legacyPaths.getAudioIndexPath(book.uuid)
      rmSync(legacyAudioIndex)

      logger.info("Deleted audio index file")
    } catch (e) {
      if (e instanceof Error && "code" in e && e.code === "ENOENT") {
        logger.info("Skipped audio index file (missing)")
      } else {
        logger.error(`Failed to delete audio index file`)
        logger.error(e)
      }
    }

    try {
      rmdirSync(dirname(legacyPaths.getEpubFilepath(book.uuid)))
      rmdirSync(legacyPaths.getEpubSyncedDirectory(book.uuid))
      rmdirSync(legacyPaths.getEpubDirectory(book.uuid))
      logger.info("Cleaned up old ebook directory")
    } catch {
      logger.info(
        `Left old ebook directory in place — some content was not migrated: ${legacyPaths.getEpubDirectory(book.uuid)}`,
      )
    }

    try {
      rmdirSync(legacyPaths.getAudioDirectory(book.uuid))
      logger.info("Cleaned up old audio directory")
    } catch {
      logger.info(
        `Left old audio directory in place — some content was not migrated: ${legacyPaths.getAudioDirectory(book.uuid)}`,
      )
    }
  }

  try {
    rmdirSync(TEXT_DIR)
    logger.info("Cleaned up old ebook directory")
  } catch {
    logger.info(
      `Left old ebook directory in place — some content was not migrated: ${TEXT_DIR}`,
    )
  }

  try {
    rmdirSync(AUDIO_DIR)
    logger.info("Cleaned up old audio directory")
  } catch {
    logger.info(
      `Left old audio directory in place — some content was not migrated: ${AUDIO_DIR}`,
    )
  }

  rmSync(CACHE_DIR, { recursive: true, force: true })
  rmSync(join(DATA_DIR, "dict"), { recursive: true, force: true })
}
