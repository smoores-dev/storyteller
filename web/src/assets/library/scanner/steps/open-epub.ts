import { Epub, EpubVersionError } from "@storyteller-platform/epub"

import { type PipelineStep, isEpubFormat } from "@/assets/library/scanner/types"

export const openEpubStep: PipelineStep = {
  name: "open-epub",

  async run(ctx) {
    if (!isEpubFormat(ctx.format)) {
      return
    }

    if (!ctx.flags.has("changed") && !ctx.flags.has("new")) {
      return
    }

    try {
      ctx.epub = await Epub.from(ctx.filepath)
    } catch (error) {
      if (!(error instanceof EpubVersionError)) {
        throw error
      }

      // let the upgrade-epub step handle this
      ctx.isEpub2 = true
    }
  },

  cleanup(ctx) {
    if (!ctx.epub) {
      return
    }

    // the scan pipeline only reads from files, never writes to them.
    // writing metadata back to source files is handled by fileWriteDistributor.
    ctx.epub.discardAndClose()
    ctx.epub = null
  },
}
