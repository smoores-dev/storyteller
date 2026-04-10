import { Epub } from "@storyteller-platform/epub"

import { type PipelineStep } from "@/assets/autoimport/scanner/types"
import { suppressPath, unsuppressPath } from "@/assets/autoimport/writeIntent"

export const openEpubStep: PipelineStep = {
  name: "open-epub",
  async run(ctx) {
    if (ctx.format === "audiobook") {
      return
    }

    if (!ctx.flags.has("changed") && !ctx.flags.has("new")) {
      return
    }

    ctx.epub = await Epub.from(ctx.filepath, { skipVersionCheck: true })

    const version = await ctx.epub.getVersion()
    ctx.isEpub2 = !!version && !version.startsWith("3.")
  },

  async cleanup(ctx) {
    if (!ctx.epub) {
      return
    }

    if (!ctx.flags.has("changed") && !ctx.flags.has("new")) {
      ctx.epub.discardAndClose()
      return
    }

    suppressPath(ctx.filepath)
    try {
      await ctx.epub.saveAndClose()
    } finally {
      unsuppressPath(ctx.filepath)
    }
    ctx.epub = null
  },
}
