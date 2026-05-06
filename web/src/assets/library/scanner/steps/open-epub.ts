import { Epub, EpubVersionError } from "@storyteller-platform/epub"

import { createStep } from "@/assets/library/scanner/step"
import {
  type EpubHashed,
  type EpubOpenState,
} from "@/assets/library/scanner/types"

const STEP = "open-epub"

export type OpenEpubInput = EpubHashed
export type OpenEpubOutput = EpubOpenState

export const openEpubStep = createStep<OpenEpubInput, OpenEpubOutput>(
  STEP,
  async (input, ctx) => {
    const scope = ctx.scope
    if (!scope) {
      throw new Error("open-epub step requires ctx.scope")
    }

    try {
      const epub = scope.use(await Epub.from(input.filepath))
      return { ...input, isEpub2: false, epub }
    } catch (error) {
      if (!(error instanceof EpubVersionError)) throw error
      return { ...input, isEpub2: true }
    }
  },
)
