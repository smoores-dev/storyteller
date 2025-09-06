import { jsonArrayFrom, jsonObjectFrom } from "kysely/helpers/sqlite"

import {
  getAudioCover,
  getEpubCover,
  writeExtractedAudiobookCover,
  writeExtractedEbookCover,
} from "@/assets/covers"
import { type BookWithRelations } from "@/database/books"
import { db } from "@/database/connection"
import { logger } from "@/logging"
import { type UUID } from "@/uuid"

function booksQuery(userId?: UUID) {
  return db
    .selectFrom("book")
    .selectAll("book")
    .select((eb) => [
      jsonArrayFrom(
        eb
          .selectFrom("creator")
          .distinct()
          .innerJoin(
            "bookToCreator",
            "bookToCreator.creatorUuid",
            "creator.uuid",
          )
          .select([
            "creator.uuid",
            "creator.id",
            "creator.name",
            "creator.fileAs",
            "creator.createdAt",
            "creator.updatedAt",
          ])
          .whereRef("bookToCreator.bookUuid", "=", "book.uuid")
          .where("bookToCreator.role", "=", "aut"),
      ).as("authors"),
      jsonArrayFrom(
        eb
          .selectFrom("creator")
          .distinct()
          .innerJoin(
            "bookToCreator",
            "bookToCreator.creatorUuid",
            "creator.uuid",
          )
          .select([
            "creator.uuid",
            "creator.id",
            "creator.name",
            "creator.fileAs",
            "creator.createdAt",
            "creator.updatedAt",
          ])
          .whereRef("bookToCreator.bookUuid", "=", "book.uuid")
          .where("bookToCreator.role", "=", "nrt"),
      ).as("narrators"),
      jsonArrayFrom(
        eb
          .selectFrom("creator")
          .distinct()
          .innerJoin(
            "bookToCreator",
            "bookToCreator.creatorUuid",
            "creator.uuid",
          )
          .select([
            "creator.uuid",
            "creator.id",
            "creator.name",
            "creator.fileAs",
            "bookToCreator.role",
            "creator.createdAt",
            "creator.updatedAt",
          ])
          .whereRef("bookToCreator.bookUuid", "=", "book.uuid")
          .where("bookToCreator.role", "!=", "nrt")
          .where("bookToCreator.role", "!=", "aut"),
      ).as("creators"),
      jsonArrayFrom(
        eb
          .selectFrom("series")
          .distinct()
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
          .distinct()
          .innerJoin("bookToTag", "bookToTag.tagUuid", "tag.uuid")
          .select(["tag.uuid", "tag.name", "tag.createdAt", "tag.updatedAt"])
          .whereRef("bookToTag.bookUuid", "=", "book.uuid"),
      ).as("tags"),
      jsonArrayFrom(
        eb
          .selectFrom("collection")
          .distinct()
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
            "collection.importPath",
            "collection.createdAt",
            "collection.updatedAt",
          ])
          .whereRef("bookToCollection.bookUuid", "=", "book.uuid"),
      ).as("collections"),
      jsonObjectFrom(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call
        eb
          // @ts-expect-error Table has been dropped
          .selectFrom("processingTask")
          // @ts-expect-error Table has been dropped
          .select([
            "processingTask.uuid",
            "processingTask.progress",
            "processingTask.status",
            "processingTask.type",
            "processingTask.createdAt",
            "processingTask.updatedAt",
          ])
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          .whereRef("processingTask.bookUuid", "=", "book.uuid")
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          .orderBy("processingTask.updatedAt", "desc")
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          .limit(1),
      ).as("processingTask"),
      ...(userId
        ? [
            jsonObjectFrom(
              eb
                .selectFrom("status")
                .distinct()
                .select([
                  "status.uuid",
                  "status.name",
                  "status.createdAt",
                  "status.updatedAt",
                ])
                .innerJoin(
                  "bookToStatus",
                  "bookToStatus.statusUuid",
                  "status.uuid",
                )
                .whereRef("bookToStatus.bookUuid", "=", "book.uuid")
                .where("bookToStatus.userId", "=", userId),
            ).as("status"),
            jsonObjectFrom(
              eb
                .selectFrom("position")
                .distinct()
                .select([
                  "position.uuid",
                  "position.locator",
                  "position.timestamp",
                  "position.createdAt",
                  "position.updatedAt",
                ])
                .whereRef("position.bookUuid", "=", "book.uuid")
                .where("position.userId", "=", userId),
            ).as("position"),
          ]
        : []),
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
    .$if(!!userId, (qb) =>
      qb
        .leftJoin("bookToCollection", "book.uuid", "bookToCollection.bookUuid")
        .leftJoin(
          "collection",
          "collection.uuid",
          "bookToCollection.collectionUuid",
        )
        .leftJoin(
          "collectionToUser",
          "collectionToUser.collectionUuid",
          "bookToCollection.collectionUuid",
        )
        .where((eb) =>
          eb.or([
            // The $if condition ensures that this only runs when userId
            // is not null
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            eb("collectionToUser.userId", "=", userId!),
            eb("collection.public", "=", true),
            eb("collection.public", "is", null),
          ]),
        ),
    )
    .groupBy("book.uuid")
}

export default async function migrate() {
  logger.info("Extracting cover images")
  const books = await booksQuery().execute()

  for (const book of books) {
    logger.info(`Extracting ebook cover for ${book.title}`)
    const ebookCover = await getEpubCover(book as BookWithRelations)
    if (ebookCover) {
      await writeExtractedEbookCover(book, ebookCover.filename, ebookCover.data)
    }

    logger.info(`Extracting audiobook cover for ${book.title}`)
    const audiobookCover = await getAudioCover(book as BookWithRelations)
    if (audiobookCover) {
      await writeExtractedAudiobookCover(
        book,
        audiobookCover.filename,
        audiobookCover.data,
      )
    }
  }
}
