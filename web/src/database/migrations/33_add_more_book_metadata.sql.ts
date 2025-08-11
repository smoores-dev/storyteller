import { getEpubFilepath, getEpubAlignedFilepath } from "@/assets/legacy/paths"
import { Epub } from "@smoores/epub/node"
import { db } from "../connection"
import { stat } from "node:fs/promises"
import { jsonArrayFrom, jsonObjectFrom } from "kysely/helpers/sqlite"
import { logger } from "@/logging"
import { getMetadataFromEpub } from "@/process/processEpub"

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
    ])
    .execute()
}

export default async function migrate() {
  const books = await getBooks()
  for (const book of books) {
    let epub: Epub
    let createdAt: string
    let aligned = false
    const syncedFilepath = getEpubAlignedFilepath(book.uuid)
    try {
      epub = await Epub.from(syncedFilepath)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      createdAt = (await stat(syncedFilepath)).mtime
        .toISOString()
        .replaceAll("T", " ")
        .split(".")[0]!

      aligned = true
    } catch {
      const originalFilepath = getEpubFilepath(book.uuid)
      try {
        epub = await Epub.from(originalFilepath)
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        createdAt = (await stat(originalFilepath)).mtime
          .toISOString()
          .replaceAll("T", " ")
          .split(".")[0]!
      } catch {
        continue
      }
    }
    try {
      // const audioDirectory = getOriginalAudioFilepath(book.uuid)
      // const entries = await readdir(audioDirectory)

      // const firstTrack = entries.find((entry) => isAudioFile(entry))
      // const audiobook =
      //   firstTrack === undefined
      //     ? undefined
      //     : await Audiobook.from(
      //         getOriginalAudioFilepath(book.uuid, firstTrack),
      //       )

      // const narrators = (await audiobook?.getNarrators()) ?? []
      // audiobook?.close()

      const {
        update,
        relations: { tags = [], series = [] },
      } = await getMetadataFromEpub(epub)

      if (update) {
        delete update.title
        delete update.language
      }

      if (book.alignedAt === null && update?.alignedAt === null && aligned) {
        book.alignedAt = createdAt
      }

      if (update) {
        await db
          .updateTable("book")
          .set(update)
          .where("uuid", "=", book.uuid)
          .execute()
      }

      await db
        .deleteFrom("bookToSeries")
        .where("bookToSeries.bookUuid", "=", book.uuid)
        .execute()

      for (const s of series) {
        let existing = await db
          .selectFrom("series")
          .select(["uuid"])
          .where((eb) =>
            s.uuid
              ? eb.or([
                  eb("series.name", "=", s.name),
                  eb("series.uuid", "=", s.uuid),
                ])
              : eb("series.name", "=", s.name),
          )
          .executeTakeFirst()

        existing = await db
          .insertInto("series")
          .values({
            name: s.name,
            description: s.description,
          })
          .returning(["uuid as uuid"])
          .executeTakeFirstOrThrow()

        await db
          .insertInto("bookToSeries")
          .values({
            seriesUuid: existing.uuid,
            bookUuid: book.uuid,
            position: s.position,
            featured: s.featured,
          })
          .execute()
      }

      await db
        .deleteFrom("series")
        .where("series.uuid", "not in", (eb) =>
          eb.selectFrom("bookToSeries").select(["bookToSeries.seriesUuid"]),
        )
        .execute()

      if (tags.length) {
        await db
          .insertInto("tag")
          .columns(["name"])
          .expression((eb) =>
            eb
              .selectFrom(() =>
                tags
                  .map((tag) =>
                    db.selectNoFrom([eb.val(tag).as("name")]).where((web) =>
                      web.not(
                        web.exists(
                          web
                            .selectFrom("tag")
                            .select([web.lit(1).as("one")])
                            .where("tag.name", "=", tag),
                        ),
                      ),
                    ),
                  )
                  .reduce((acc, expr) => acc.unionAll(expr))
                  .as("values"),
              )
              .selectAll(),
          )
          .execute()

        await db
          .insertInto("bookToTag")
          .columns(["bookUuid", "tagUuid"])
          .expression((eb) =>
            eb
              .selectFrom(() =>
                tags
                  .map((tag) =>
                    eb
                      .selectFrom("tag")
                      .select([
                        eb.val(book.uuid).as("bookUuid"),
                        "tag.uuid as tagUuid",
                      ])
                      .where("tag.name", "=", tag)
                      .where((web) =>
                        web.not(
                          web.exists(
                            web
                              .selectFrom("bookToTag")
                              .select([web.lit(1).as("one")])
                              .innerJoin("tag", "tag.uuid", "tagUuid")
                              .where("bookUuid", "=", book.uuid)
                              .where("tag.name", "=", tag),
                          ),
                        ),
                      ),
                  )
                  .reduce((acc, expr) => acc.unionAll(expr))
                  .as("values"),
              )
              .selectAll(),
          )
          .execute()
      }

      await db
        .updateTable("book")
        .set({ createdAt })
        .where("uuid", "=", book.uuid)
        .execute()
    } catch (e) {
      logger.error(
        `Encountered error reading metadata from assets for book ${book.title}. Skipping.`,
      )
      logger.error(e)
    }
  }
}
