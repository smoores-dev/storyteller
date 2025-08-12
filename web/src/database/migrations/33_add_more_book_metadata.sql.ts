import { getEpubFilepath, getEpubAlignedFilepath } from "@/assets/legacy/paths"
import { Epub } from "@smoores/epub/node"
import { db } from "../connection"
import { stat } from "node:fs/promises"
import { logger } from "@/logging"
import { getMetadataFromEpub } from "@/process/processEpub"

async function getBooks() {
  return await db.selectFrom("book").selectAll("book").execute()
}

export default async function migrate() {
  logger.info("Importing new metadata from source files")
  const books = await getBooks()
  for (const book of books) {
    logger.info(`Importing metadata for ${book.title}`)
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
    } catch (re) {
      const originalFilepath = getEpubFilepath(book.uuid)
      try {
        epub = await Epub.from(originalFilepath)
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        createdAt = (await stat(originalFilepath)).mtime
          .toISOString()
          .replaceAll("T", " ")
          .split(".")[0]!
      } catch (e) {
        logger.error(
          `Failed to open EPUB file for book ${book.title}. Skipping.`,
        )
        logger.error(re)
        logger.error(e)
        continue
      }
    }
    try {
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

      for (const s of series) {
        let existing = await db
          .selectFrom("series")
          .select(["uuid"])
          .where("series.name", "=", s.name)
          .executeTakeFirst()

        if (!existing) {
          existing = await db
            .insertInto("series")
            .values({
              name: s.name,
              description: s.description,
            })
            .returning(["uuid as uuid"])
            .executeTakeFirstOrThrow()
        }

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
