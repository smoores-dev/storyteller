import { type PipelineStep } from "@/assets/autoimport/scanner/types"
import {
  getMetadataFromAudiobook,
  getMetadataFromEpub,
} from "@/assets/metadata"

export const extractMetadataStep: PipelineStep = {
  name: "extract-metadata",
  async run(ctx) {
    if (!ctx.flags.has("changed") && !ctx.flags.has("new")) {
      return
    }

    if (ctx.format === "ebook") {
      if (!ctx.epub) {
        return
      }

      const { update, relations } = await getMetadataFromEpub(ctx.epub)
      ctx.extractedMetadata = update
      ctx.extractedRelations = relations
      ctx.epub = null
      return
    }

    if (!ctx.audiobook) {
      return
    }

    const { update, relations } = await getMetadataFromAudiobook(ctx.audiobook)
    ctx.extractedMetadata = update
    ctx.extractedRelations = relations
  },
}
