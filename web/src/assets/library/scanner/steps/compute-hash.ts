import { hashAudiobookDirectory, hashFile } from "@/assets/hash"
import { getFormatRelationPatch } from "@/assets/library/scanner/formatRelations"
import { defineStep } from "@/assets/library/scanner/step2"
import { type Fingerprinted, type Hashed } from "@/assets/library/scanner/types"
import { updateBook } from "@/database/books"

const STEP = "compute-hash"

export const computeHashStep = defineStep(
  STEP,
  async (input: Fingerprinted, ctx): Promise<Hashed> => {
    const { hash } =
      input.format === "audiobook"
        ? await hashAudiobookDirectory(
            input.filepath,
            ctx.signal,
            input.statEntries,
          )
        : await hashFile(
            input.filepath,
            ctx.signal,
            input.statEntries[0]?.size ?? null,
          )

    if (input.isNew || input.existingHash !== hash) {
      await updateBook(
        input.bookUuid,
        null,
        getFormatRelationPatch(input, { contentHash: hash }),
      )
    }

    return {
      ...input,
      fileHash: hash,
      existingHash: hash,
    }
  },
)
