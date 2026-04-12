import {
  type PipelineStep,
  type ScanContext,
} from "@/assets/library/scanner/types"
import { type SerializedManifest } from "@/components/reader/types"
import { getReadiumService } from "@/services/readiumService"
import { createAudiobookManifest } from "@/utils/audioManifest"

import { getNumericValue, normalizeManifestValue } from "./utils"

function deriveAudiobookDuration(manifest: SerializedManifest): number | null {
  const readingOrder = manifest.readingOrder
  let duration = 0

  for (const item of readingOrder) {
    const value = getNumericValue(item.duration)
    if (value === null) {
      continue
    }

    duration += value
  }

  return duration > 0 ? duration : null
}

async function deriveEbookPositionsCount(
  ctx: ScanContext,
): Promise<number | null> {
  try {
    const positions = await globalThis.readiumServiceInstance?.makeRequest(
      ctx.filepath,
      "~readium/positions.json",
      // TODO: Add signal
    )

    if (!positions) {
      return null
    }

    const pos = (await positions.json()) as { total: number }

    return pos.total
  } catch (error) {
    ctx.logger.error({
      msg: "Failed to derive ebook positions count",
      err: error,
      bookUuid: ctx.bookUuid,
      filepath: ctx.filepath,
    })
    return null
  }
}

function resolveReadaloudPageCount(
  ctx: ScanContext,
  ownPageCount: number | null,
): number | null {
  const ebook = ctx.book?.ebook
  if (ebook && !ebook.missing && ebook.pageCount) {
    return ebook.pageCount
  }

  return ownPageCount
}

function resolveReadaloudDuration(
  ctx: ScanContext,
  manifest: SerializedManifest,
): number | null {
  const audiobook = ctx.book?.audiobook
  if (audiobook && !audiobook.missing && audiobook.duration) {
    return audiobook.duration
  }

  let duration = 0
  for (const item of manifest.resources ?? []) {
    const value = getNumericValue(item.duration)
    if (value === null) {
      continue
    }

    duration += value
  }
  return duration > 0 ? duration : null
}

export const extractManifestStep: PipelineStep = {
  name: "extract-manifest",
  async run(ctx) {
    if (!ctx.book) {
      return
    }

    const formatRelation = ctx.book[ctx.format]

    const normalizeManifest = normalizeManifestValue as (
      value: unknown,
    ) => SerializedManifest | null
    const existingManifest = normalizeManifest(formatRelation?.manifest)

    if (
      !ctx.flags.has("changed") &&
      !ctx.flags.has("new") &&
      existingManifest
    ) {
      ctx.manifest = existingManifest
      ctx.pageCount = formatRelation?.pageCount ?? null
      ctx.duration = formatRelation?.duration ?? null

      return
    }

    if (ctx.format === "ebook") {
      ctx.logger.debug(`Extracting manifest for book ${ctx.book.title}`)
      const readiumService = getReadiumService()
      if (!readiumService.isRunning()) {
        await readiumService.start()
      }

      const response = await readiumService.makeRequest(
        ctx.filepath,
        "manifest.json",
      )
      const manifest = (await response.json()) as SerializedManifest
      ctx.manifest = manifest
      ctx.pageCount = await deriveEbookPositionsCount(ctx)

      return
    }

    if (ctx.format === "readaloud") {
      ctx.logger.debug(`Extracting manifest for readaloud ${ctx.book.title}`)
      const readiumService = getReadiumService()
      if (!readiumService.isRunning()) {
        await readiumService.start()
      }

      const response = await readiumService.makeRequest(
        ctx.filepath,
        "manifest.json",
      )
      const manifest = (await response.json()) as SerializedManifest
      ctx.manifest = manifest

      const ownPageCount = await deriveEbookPositionsCount(ctx)
      ctx.pageCount = resolveReadaloudPageCount(ctx, ownPageCount)
      ctx.duration = resolveReadaloudDuration(ctx, manifest)
      return
    }

    ctx.logger.debug(`Creating audiobook manifest`)
    const manifestOptions = {
      bookId: ctx.book.uuid,
      title: ctx.book.title,
      updatedAt: new Date(ctx.book.updatedAt),
      ...(ctx.book.subtitle ? { subtitle: ctx.book.subtitle } : {}),
      ...(ctx.book.description ? { description: ctx.book.description } : {}),
      ...(ctx.book.language ? { language: ctx.book.language } : {}),
    }
    const manifest = await createAudiobookManifest(
      ctx.filepath,
      manifestOptions,
    )
    const serialized = manifest.serialize() as SerializedManifest
    ctx.manifest = serialized
    ctx.duration = deriveAudiobookDuration(serialized)
  },
}
