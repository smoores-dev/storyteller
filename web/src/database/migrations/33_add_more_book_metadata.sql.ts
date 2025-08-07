import {
  getEpubFilepath,
  getEpubAlignedFilepath,
  getOriginalAudioFilepath,
} from "@/assets/legacy/paths"
import { BookUpdate, SeriesRelation } from "../books"
import { Epub } from "@smoores/epub/node"
import { db } from "../connection"
import { readdir, stat } from "node:fs/promises"
import { jsonArrayFrom, jsonObjectFrom } from "kysely/helpers/sqlite"
import { syncRelations } from "../relations"
import { isAudioFile } from "@/audio"
import { Audiobook } from "@smoores/audiobook/node"

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
    const tags: string[] = []
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

    const audioDirectory = getOriginalAudioFilepath(book.uuid)
    const entries = await readdir(audioDirectory)

    const firstTrack = entries.find((entry) => isAudioFile(entry))
    const audiobook =
      firstTrack === undefined
        ? undefined
        : await Audiobook.from(getOriginalAudioFilepath(book.uuid, firstTrack))

    const narrators = (await audiobook?.getNarrators()) ?? []
    audiobook?.close()

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

    const subjects = await epub.getSubjects()
    for (const subject of subjects) {
      tags.push(typeof subject === "string" ? subject : subject.value)
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

    await syncRelations({
      entityUuid: book.uuid,
      relations: narrators.map((name) => ({ name })),
      relatedTable: "narrator",
      relationTable: "bookToNarrator",
      relatedPrimaryKeyColumn: "uuid",
      identifierColumn: "name",
      relatedForeignKeyColumn: "bookToNarrator.narratorUuid",
      entityForeignKeyColumn: "bookToNarrator.bookUuid",
      extractRelatedValues: (values) => ({
        name: values.name ?? "",
      }),
      extractRelationValues: (narratorUuid) => ({
        narratorUuid,
        bookUuid: book.uuid,
      }),
      extractRelationUpdateValues: () => ({}),
    })

    await db
      .updateTable("book")
      .set({ createdAt })
      .where("uuid", "=", book.uuid)
      .execute()
  }
}
