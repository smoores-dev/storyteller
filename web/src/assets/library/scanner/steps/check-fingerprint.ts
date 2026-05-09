import {
  fingerprintAudiobookDirectory,
  fingerprintFile,
} from "@/assets/library/fingerprint"
import { getFormatRelationPatch } from "@/assets/library/scanner/formatRelations"
import { defineStep } from "@/assets/library/scanner/step2"
import {
  type Existing,
  type Fingerprinted,
} from "@/assets/library/scanner/types"
import { updateBook } from "@/database/books"

const STEP = "check-fingerprint"

export const checkFingerprintStep = defineStep(
  STEP,
  async (input: Existing, ctx): Promise<Fingerprinted> => {
    const { fingerprint, fileSize, entries } =
      input.format === "audiobook"
        ? await fingerprintAudiobookDirectory(input.filepath, ctx.signal)
        : await fingerprintFile(input.filepath)

    const changed =
      !!ctx.options.force ||
      input.isNew ||
      input.existingFingerprint !== fingerprint

    if (changed) {
      await updateBook(
        input.bookUuid,
        null,
        getFormatRelationPatch(input, { fingerprint, fileSize }),
      )
    }

    return {
      ...input,
      fingerprint,
      fileSize,
      existingFingerprint: fingerprint,
      changed,
      statEntries: entries,
    }
  },
)
