import { hashAudiobookDirectory, hashFile } from "@/assets/hash"
import {
  type PipelineStep,
  isResolvedFormat,
} from "@/assets/library/scanner/types"
import { updateBook } from "@/database/books"

import { getFormatRelationPatch } from "./utils"

export const computeHashStep: PipelineStep = {
  name: "compute-hash",

  async run(ctx) {
    const { hash, fileSize } =
      ctx.format === "audiobook"
        ? await hashAudiobookDirectory(ctx.filepath)
        : await hashFile(ctx.filepath)

    ctx.logger.debug(`Computed hash for ${ctx.filepath}: ${hash}`)

    ctx.fileHash = hash
    ctx.fileSize = fileSize

    if (
      ctx.options.force ||
      ctx.flags.has("new") ||
      ctx.existingHash !== hash
    ) {
      ctx.flags.add("changed")
    }

    // defer DB write for unresolved formats; reconcile-metadata will persist everything
    if (!isResolvedFormat(ctx.format)) {
      return
    }

    await updateBook(
      ctx.bookUuid,
      null,
      getFormatRelationPatch(ctx, {
        missing: false,
        contentHash: hash,
        fileSize,
      }),
    )

    ctx.existingHash = hash
  },
}
