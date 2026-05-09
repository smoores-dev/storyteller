import { hashAudiobookDirectory, hashFile } from "@/assets/hash"
import { getFormatRelationPatch } from "@/assets/library/scanner/formatRelations"
import { defineStep } from "@/assets/library/scanner/step2"
import { type Existing, type Hashed } from "@/assets/library/scanner/types"
import { updateBook } from "@/database/books"

const STEP = "compute-hash"

export type ComputeHashInput = Existing
export type ComputeHashOutput = Hashed

export const computeHashStep = defineStep(
  STEP,
  async (input: ComputeHashInput, ctx) => {
    const { hash, fileSize } =
      input.format === "audiobook"
        ? await hashAudiobookDirectory(input.filepath, ctx.signal)
        : await hashFile(input.filepath, ctx.signal)

    const changed =
      !!ctx.options.force || input.isNew || input.existingHash !== hash

    await updateBook(
      input.bookUuid,
      null,
      getFormatRelationPatch(input, {
        missing: false,
        contentHash: hash,
        fileSize,
      }),
    )

    return {
      ...input,
      fileHash: hash,
      fileSize,
      existingHash: hash,
      changed,
    }
  },
)
