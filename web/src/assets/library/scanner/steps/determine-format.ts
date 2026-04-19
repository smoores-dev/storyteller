import {
  type PipelineStep,
  type ResolvedEpubFormat,
} from "@/assets/library/scanner/types"

export const determineFormatStep: PipelineStep = {
  name: "determine-format",

  async run(ctx) {
    if (ctx.format !== "epub-unknown") {
      return
    }

    if (!ctx.epub) {
      ctx.logger.warn(
        `No open EPUB to determine format for ${ctx.filepath}, skipping`,
      )

      return false
    }

    const manifest = await ctx.epub.getManifest()

    const hasMediaOverlays = Object.values(manifest).some(
      (item) => item.mediaOverlay,
    )

    const resolved: ResolvedEpubFormat = hasMediaOverlays
      ? "readaloud"
      : "ebook"

    ctx.format = resolved
    ctx.logger.info(`Classified as ${resolved}`)

    return undefined
  },
}
