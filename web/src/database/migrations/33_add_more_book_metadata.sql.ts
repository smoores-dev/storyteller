import { getEpubFilepath, getEpubAlignedFilepath } from "@/assets/legacy/paths"
import { BookUpdate, getBooks, SeriesRelation, updateBook } from "../books"
import { Epub } from "@smoores/epub/node"
import { db } from "../connection"
import { stat } from "node:fs/promises"

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
    await updateBook(book.uuid, update, { series })

    await db
      .updateTable("book")
      .set({ createdAt })
      .where("uuid", "=", book.uuid)
      .execute()
  }
}
