import { getReadiumService } from "@/services/readiumService"
import { createAudiobookManifest } from "@/utils/audioManifest"

import { type PipelineStep } from "../types"
import { getNumericValue } from "./utils"

function deriveAudiobookDuration(
  manifest: Record<string, unknown>,
): number | null {
  const readingOrder = manifest["readingOrder"]
  if (!Array.isArray(readingOrder)) {
    return null
  }

  let duration = 0
  for (const item of readingOrder) {
    if (!item || typeof item !== "object") {
      continue
    }

    const value = getNumericValue((item as Record<string, unknown>)["duration"])
    if (value === null) {
      continue
    }

    duration += value
  }

  return duration > 0 ? duration : null
}

function deriveEbookPositionsCount(
  manifest: Record<string, unknown>,
): number | null {
  const metadata = manifest["metadata"]
  if (metadata && typeof metadata === "object") {
    const numberOfPages = getNumericValue(
      (metadata as Record<string, unknown>)["numberOfPages"],
    )
    if (numberOfPages !== null) {
      return Math.max(0, Math.round(numberOfPages))
    }

    const numberOfItems = getNumericValue(
      (metadata as Record<string, unknown>)["numberOfItems"],
    )
    if (numberOfItems !== null) {
      return Math.max(0, Math.round(numberOfItems))
    }
  }

  const readingOrder = manifest["readingOrder"]
  if (!Array.isArray(readingOrder)) {
    return null
  }

  const count = readingOrder.length
  if (count <= 0) {
    return null
  }

  return count
}

export const extractManifestStep: PipelineStep = {
  name: "extract-manifest",
  async run(ctx) {
    if (!ctx.flags.has("changed") && !ctx.flags.has("new")) {
      return
    }

    if (!ctx.book) {
      return
    }

    if (ctx.format === "ebook") {
      const readiumService = getReadiumService()
      if (!readiumService.isRunning()) {
        await readiumService.start()
      }

      const response = await readiumService.makeRequest(
        ctx.filepath,
        "manifest.json",
      )
      const manifest = (await response.json()) as Record<string, unknown>
      ctx.manifest = manifest
      return
    }

    const manifest = await createAudiobookManifest(ctx.filepath, {
      bookId: ctx.book.uuid,
      title: ctx.book.title,
      subtitle: ctx.book.subtitle ?? undefined,
      description: ctx.book.description ?? undefined,
      language: ctx.book.language ?? undefined,
      updatedAt: new Date(ctx.book.updatedAt),
    })
    const serialized = manifest.serialize() as Record<string, unknown>
    ctx.manifest = serialized
  },
}
