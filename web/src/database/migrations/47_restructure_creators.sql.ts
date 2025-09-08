import { readdir } from "node:fs/promises"
import { join } from "node:path"

import { jsonObjectFrom } from "kysely/helpers/sqlite"

import { Audiobook } from "@storyteller-platform/audiobooklib/node"

import { isAudioFile } from "@/audio"
import { db } from "@/database/connection"
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
            "ebook.missing",
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
            "audiobook.missing",
            "audiobook.createdAt",
            "audiobook.updatedAt",
          ])
          .whereRef("audiobook.bookUuid", "=", "book.uuid"),
      ).as("audiobook"),
      jsonObjectFrom(
        eb
          .selectFrom("readaloud")
          .select([
            "readaloud.uuid",
            "readaloud.filepath",
            "readaloud.missing",
            "readaloud.status",
            "readaloud.createdAt",
            "readaloud.updatedAt",
          ])
          .whereRef("readaloud.bookUuid", "=", "book.uuid"),
      ).as("readaloud"),
    ])
    .execute()
}

export default async function migrate() {
  logger.info("Importing narrator metadata from audio files")
  const books = await getBooks()
  for (const book of books) {
    const audioDirectory = book.audiobook?.filepath
    if (!audioDirectory) continue

    logger.info(`Importing narrators for ${book.title}`)

    const entries = await readdir(audioDirectory)

    const firstTrack = entries.find((entry) => isAudioFile(entry))
    const audiobook =
      firstTrack === undefined
        ? undefined
        : await Audiobook.from(join(audioDirectory, firstTrack))

    let narrators: string[] = []
    try {
      narrators = (await audiobook?.getNarrators()) ?? []
    } catch (e) {
      logger.error(`Failed to read narrators from audiobook, skipping`)
      logger.error(e)
    } finally {
      audiobook?.close()
    }

    for (const narrator of narrators) {
      let existing = await db
        .selectFrom("creator")
        .select(["uuid"])
        .where("creator.name", "=", narrator)
        .executeTakeFirst()

      if (!existing) {
        existing = await db
          .insertInto("creator")
          .values({ name: narrator, fileAs: narrator })
          .returning(["uuid as uuid"])
          .executeTakeFirstOrThrow()
      }

      await db
        .insertInto("bookToCreator")
        .values({
          creatorUuid: existing.uuid,
          bookUuid: book.uuid,
          role: "nrt",
        })
        .execute()
    }
  }
}
