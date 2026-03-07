import { Epub } from "@storyteller-platform/epub"

import { type PipelineStep } from "../types"

export const openEpubStep: PipelineStep = {
  name: "open-epub",
  async run(ctx) {
    if (ctx.format !== "ebook") {
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

    ctx.epub.discardAndClose()
    ctx.epub = null
  },
}

