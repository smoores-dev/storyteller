import {
  type StatEntry,
  fingerprintAudiobookDirectory,
  fingerprintFile,
} from "@/assets/library/fingerprint"
import { defineStep } from "@/assets/library/scanner/step"

import { type Existing } from "./check-exists"

const STEP = "check-fingerprint"

export const checkFingerprintStep = defineStep(
  STEP,
  async (input: Existing, ctx) => {
    const { fingerprint, fileSize, entries } =
      input.format === "audiobook"
        ? await fingerprintAudiobookDirectory(input.filepath, ctx.signal)
        : await fingerprintFile(input.filepath)

    const changed =
      !!ctx.options.force ||
      input.isNew ||
      input.existingFingerprint !== fingerprint

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

export type FingerPrinted = Existing & {
  fingerprint: string
  fileSize: number | null
  changed: boolean
  statEntries: StatEntry[]
}
