import { Epub } from "@storyteller-platform/epub"

import { type PipelineStep } from "@/assets/autoimport/scanner/types"

export const openEpubStep: PipelineStep = {
  name: "open-epub",
  async run(ctx) {
    if (ctx.format === "audiobook") {
      return
    }

    if (!ctx.flags.has("changed") && !ctx.flags.has("new")) {
      return
    }

    ctx.epub = await Epub.from(ctx.filepath)
  },
  async cleanup(ctx) {
    if (!ctx.epub) {
      return
    }

    if (!ctx.flags.has("changed") && !ctx.flags.has("new")) {
      ctx.epub.discardAndClose()
      return
    }

    await ctx.epub.saveAndClose()
    ctx.epub = null
  },
}
