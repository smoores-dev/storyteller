import { mkdirSync, renameSync, rmSync, rmdirSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { dirname, extname, join } from "node:path"

import { jsonObjectFrom } from "kysely/helpers/sqlite"

import { Epub } from "@storyteller-platform/epub"

import * as legacyCovers from "@/assets/legacy/covers"
import * as legacyPaths from "@/assets/legacy/paths"
import * as paths from "@/assets/paths"
import { db } from "@/database/connection"
import {
  ASSETS_DIR,
  AUDIO_DIR,
  CACHE_DIR,
  DATA_DIR,
  TEXT_DIR,
} from "@/directories"
import { logger } from "@/logging"

async function getBooks() {
  return await db
    .selectFrom("book")
    .selectAll("book")
    .select((eb) => [
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

      if (book.ebook) {
        book.ebook.filepath = newEpubFilepath
      }
    } catch (e) {
      if (e instanceof Error && "code" in e && e.code === "ENOENT") {
        logger.info("Skipped original ebook (missing)")
        await db.deleteFrom("ebook").where("bookUuid", "=", book.uuid).execute()
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

      if (book.audiobook) {
        book.audiobook.filepath = newAudioDir
      }

      logger.info("Migrated original audio files")
    } catch (e) {
      if (e instanceof Error && "code" in e && e.code === "ENOENT") {
        logger.info("Skipped original audio files (missing)")
        await db
          .deleteFrom("audiobook")
          .where("bookUuid", "=", book.uuid)
          .execute()
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
      mkdirSync(paths.getInternalReadaloudDirectory(book))

      const legacyAlignedDir = legacyPaths.getEpubAlignedFilepath(book.uuid)
      const newAlignedDir = paths.getInternalReadaloudFilepath(book)
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

      if (book.alignedBook) {
        // @ts-expect-error This is what the table was called briefly
        book.alignedBook.filepath = newAlignedDir
      }

      logger.info("Migrated aligned ebook")
    } catch (e) {
      if (e instanceof Error && "code" in e && e.code === "ENOENT") {
        logger.info("Skipped aligned ebook (missing)")
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        await db
          // @ts-expect-error This was briefly named aligned_book
          .deleteFrom("alignedBook")
          // @ts-expect-error This was briefly named aligned_book
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          .where("bookUuid", "=", book.uuid)
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          .execute()
      } else {
        logger.error(`Failed to migrate aligned ebook`)
        logger.error(e)
      }
    }

    try {
      const legacyEpubCover = await legacyCovers.getEpubCoverFilepath(book.uuid)
      const epubCoverName = await legacyCovers.getEpubCoverFilename(book.uuid)
      if (legacyEpubCover && epubCoverName) {
        const newEpubCoverPath = join(
          paths.getInternalEpubDirectory(book),
          epubCoverName,
        )
        renameSync(legacyEpubCover, newEpubCoverPath)

        if (book.ebook) {
          const ext = extname(epubCoverName)
          using epub = await Epub.from(book.ebook.filepath)
          const prevCoverItem = await epub.getCoverImageItem()
          await epub.setCoverImage(
            prevCoverItem?.href ?? `images/cover${ext}`,
            await readFile(newEpubCoverPath),
          )
          await epub.saveAndClose()
        }
        // @ts-expect-error This is what the table was called briefly
        if (book.alignedBook?.filepath) {
          const ext = extname(epubCoverName)
          // @ts-expect-error This is what the table was called briefly
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          using epub = await Epub.from(book.alignedBook.filepath)
          const prevCoverItem = await epub.getCoverImageItem()
          await epub.setCoverImage(
            prevCoverItem?.href ?? `images/cover${ext}`,
            await readFile(newEpubCoverPath),
          )
          // @ts-expect-error This is what the table was called briefly
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          await epub.saveAndClose(book.alignedBook.filepath)
        }
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
