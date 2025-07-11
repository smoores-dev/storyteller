import {
  getEpubAlignedFilepath,
  getEpubFilepath,
  getOriginalAudioFilepath,
} from "@/assets/legacy/paths"
import { db } from "../connection"
import { stat } from "node:fs/promises"
import { resolve } from "node:path"

export default async function migrate() {
  const books = await db.selectFrom("book").select(["uuid"]).execute()

  const bookIds = books.map((book) => book.uuid)

  for (const uuid of bookIds) {
    // TODO: Confirm that the original paths exist
    // If they've been deleted, we need to recreate them?
    // Or maybe just skip them, and then create them
    // on demand.
    await db
      .updateTable("ebook")
      .set({ filepath: resolve(getEpubFilepath(uuid)) })
      .where("bookUuid", "=", uuid)
      .execute()

    await db
      .updateTable("audiobook")
      .set({ filepath: resolve(getOriginalAudioFilepath(uuid)) })
      .where("bookUuid", "=", uuid)
      .execute()

    try {
      const alignedFilepath = resolve(getEpubAlignedFilepath(uuid))
      await stat(alignedFilepath)
      await db
        .updateTable("alignedBook")
        .set({ status: "ALIGNED", filepath: alignedFilepath })
        .where("bookUuid", "=", uuid)
        .execute()
    } catch {
      // skip this step if the book hasn't already been aligned
    }
  }
}
