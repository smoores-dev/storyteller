import { hashAudiobookDirectory, hashFile } from "@/assets/hash"
import { defineStep } from "@/assets/library/scanner/step2"
import { type Fingerprinted, type Hashed } from "@/assets/library/scanner/types"

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

    return {
      ...input,
      fileHash: hash,
      existingHash: hash,
    }
  },
)
