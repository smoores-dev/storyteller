import { Epub, EpubVersionError } from "@storyteller-platform/epub"

import { defineStep } from "@/assets/library/scanner/step2"
import {
  type EpubFingerprinted,
  type EpubOpenState,
} from "@/assets/library/scanner/types"

export type OpenEpubInput = EpubFingerprinted
export type OpenEpubOutput = EpubOpenState

export const openEpubStep = defineStep(
  "open-epub",
  async (input: OpenEpubInput, ctx) => {
    const scope = ctx.scope
    if (!scope) {
      throw new Error("open-epub step requires ctx.scope")
    }

    try {
      const epub = scope.use(
        await Epub.from(input.filepath, { metadataOnly: true }),
      )
      return { ...input, isEpub2: false as const, epub }
    } catch (error) {
      if (!(error instanceof EpubVersionError)) throw error
      return { ...input, isEpub2: true as const }
    }
  },
)
