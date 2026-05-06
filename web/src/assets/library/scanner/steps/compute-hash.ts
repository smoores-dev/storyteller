import { hashAudiobookDirectory, hashFile } from "@/assets/hash"
import { getFormatRelationPatch } from "@/assets/library/scanner/formatRelations"
import { createStep } from "@/assets/library/scanner/step"
import {
  type Existing,
  type Hashed,
  isResolvedFormat,
} from "@/assets/library/scanner/types"
import { updateBook } from "@/database/books"

const STEP = "compute-hash"

export type ComputeHashInput = Existing
export type ComputeHashOutput = Hashed

export const computeHashStep = createStep<ComputeHashInput, ComputeHashOutput>(
  STEP,
  async (input, ctx) => {
    const { hash, fileSize } =
      input.format === "audiobook"
        ? await hashAudiobookDirectory(input.filepath, ctx.signal)
        : await hashFile(input.filepath, ctx.signal)

    const changed =
      !!ctx.options.force || input.isNew || input.existingHash !== hash

    if (isResolvedFormat(input.format)) {
      await updateBook(
        input.bookUuid,
        null,
        getFormatRelationPatch(input, {
          missing: false,
          contentHash: hash,
          fileSize,
        }),
      )
    }

    return {
      ...input,
      fileHash: hash,
      fileSize,
      existingHash: hash,
      changed,
    }
  },
)
