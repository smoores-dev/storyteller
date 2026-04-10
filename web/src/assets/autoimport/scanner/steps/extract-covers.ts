import { cacheAudioCover, cacheTextCover } from "@/assets/autoimport/coverCache"
import { type PipelineStep } from "@/assets/autoimport/scanner/types"
import { getBook } from "@/database/books"

export const extractCoversStep: PipelineStep = {
  name: "extract-covers",
  async run(ctx) {
    if (!ctx.flags.has("changed") && !ctx.flags.has("new")) {
      return
    }

    const book = await getBook(ctx.bookUuid)
    if (!book) {
      return
    }

    if (ctx.format === "ebook" || ctx.format === "readaloud") {
      await cacheTextCover(book)
    }

    if (ctx.format === "audiobook") {
      await cacheAudioCover(book)
    }
  },
}
