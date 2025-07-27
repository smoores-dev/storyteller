import { getEpubFilepath, getEpubAlignedFilepath } from "@/assets/legacy/paths"
import { BookUpdate, SeriesRelation } from "../books"
import { Epub } from "@smoores/epub/node"
import { db } from "../connection"
import { stat } from "node:fs/promises"
import { jsonArrayFrom, jsonObjectFrom } from "kysely/helpers/sqlite"
import { syncRelations } from "../relations"

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
    ])
    .execute()
}

export default async function migrate() {
  const books = await getBooks()
  for (const book of books) {
    let update: BookUpdate | null = null
    const series: SeriesRelation[] = []
    let epub: Epub
    let createdAt: string
    const syncedFilepath = getEpubAlignedFilepath(book.uuid)
    try {
      epub = await Epub.from(syncedFilepath)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      createdAt = (await stat(syncedFilepath)).ctime
        .toISOString()
        .replaceAll("T", " ")
        .split(".")[0]!
    } catch {
      const originalFilepath = getEpubFilepath(book.uuid)
      try {
        epub = await Epub.from(originalFilepath)
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        createdAt = (await stat(originalFilepath)).ctime
          .toISOString()
          .replaceAll("T", " ")
          .split(".")[0]!
      } catch {
        continue
      }
    }

    const publicationDate = await epub.getPublicationDate()
    if (publicationDate) {
      update ??= {}
      update.publicationDate = publicationDate.toISOString()
    }

    const description = await epub.getDescription()
    if (description) {
      update ??= {}
      update.description = description
    }

    const metadata = await epub.getMetadata()

    for (const entry of metadata) {
      if (
        entry.properties["property"] === "belongs-to-collection" &&
        entry.value
      ) {
        const typeEntry = metadata.find(
          (e) =>
            e.properties["refines"] === `#${entry.id}` &&
            entry.properties["property"] === "collection-type",
        )?.value

        if (typeEntry !== "series") continue

        const position = metadata.find(
          (e) =>
            e.properties["refines"] === `#${entry.id}` &&
            entry.properties["property"] === "group-position",
        )?.value

        series.push({
          name: entry.value,
          featured: true,
          ...(position && { position: parseFloat(position) }),
        })
      }

      if (
        entry.properties["property"] === "storyteller:version" &&
        entry.value
      ) {
        update ??= {}
        update.alignedByStorytellerVersion = entry.value
      }

      if (
        entry.properties["property"] ===
          "storyteller:media-overlays-modified" &&
        entry.value
      ) {
        update ??= {}
        update.alignedAt = entry.value
      }
    }

    if (update) {
      await db
        .updateTable("book")
        .set(update)
        .where("uuid", "=", book.uuid)
        .execute()
    }

    await syncRelations({
      entityUuid: book.uuid,
      relations: series,
      relatedTable: "series",
      relationTable: "bookToSeries",
      relatedPrimaryKeyColumn: "uuid",
      identifierColumn: "name",
      relatedForeignKeyColumn: "bookToSeries.seriesUuid",
      entityForeignKeyColumn: "bookToSeries.bookUuid",
      extractRelatedValues: (values) => ({
        name: values.name ?? "",
        description: values.description,
      }),
      extractRelationValues: (seriesUuid, values) => ({
        seriesUuid: seriesUuid,
        bookUuid: book.uuid,
        position: values.position,
        featured: values.featured,
      }),
      extractRelationUpdateValues: (values) => ({
        position: values.position,
        featured: values.featured,
      }),
    })

    await db
      .updateTable("book")
      .set({ createdAt })
      .where("uuid", "=", book.uuid)
      .execute()
  }
}
