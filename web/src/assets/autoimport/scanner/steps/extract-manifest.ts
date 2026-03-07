import {
  ScanContext,
  type PipelineStep,
} from "@/assets/autoimport/scanner/types"
import { type SerializedManifest } from "@/components/reader/types"
import { getReadiumService, ReadiumService } from "@/services/readiumService"
import { createAudiobookManifest } from "@/utils/audioManifest"

import { getNumericValue, normalizeManifestValue } from "./utils"
import { Manifest, Publication } from "@readium/shared"
import { createCacheBustingFetch } from "@/utils/cacheBustingFetch"

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
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion

  // http://localhost:9002/webpub/VXNlcnMvdGhvbWFzL1Byb2plY3RzL3N0b3J5dGVsbGVyL2Rldi1kYXRhL2Fzc2V0cy9DYXBpdGFsIFsyMW44WkFqUF0vYWxpZ25lZC9DYXBpdGFsLmVwdWI/~readium/positions.json
  //  http://localhost:9002/webpub/VXNlcnMvdGhvbWFzL1Byb2plY3RzL3N0b3J5dGVsbGVyL2Rldi1kYXRhL2Fzc2V0cy9DYXBpdGFsIFtCQ0VZbEEzQV0vYXVkaW8/~readium/positions.json
  try {
    const positions = await globalThis.readiumServiceInstance?.makeRequest(
      ctx.filepath,
      "~readium/positions.json",
      undefined,
      {
        signal: ctx.signal,
      },
    )

    if (!positions) {
      return null
    }

    const pos = await positions.json()
    console.log(pos.total)

    return pos.total
  } catch (error) {
    console.error(error)
    return null
  }
}

export const extractManifestStep: PipelineStep = {
  name: "extract-manifest",
  async run(ctx) {
    if (!ctx.book) {
      return
    }

    const formatRelation = (() => {
      if (ctx.format === "ebook") {
        return ctx.book.ebook
      }
      if (ctx.format === "audiobook") {
        return ctx.book.audiobook
      }
      return ctx.book.readaloud
    })()
    const normalizeManifest = normalizeManifestValue as (
      value: unknown,
    ) => SerializedManifest | null
    const existingManifest = normalizeManifest(formatRelation?.manifest)

    if (
      !ctx.flags.has("changed") &&
      !ctx.flags.has("new") &&
      existingManifest
    ) {
      ctx.logger.debug(
        `No changed or new flags, skipping manifest extraction for book`,
      )
      ctx.manifest = existingManifest
      if (ctx.format === "ebook" || ctx.format === "readaloud") {
        ctx.pageCount = await deriveEbookPositionsCount(ctx, existingManifest)
      }
      if (ctx.format === "audiobook") {
        ctx.duration = deriveAudiobookDuration(existingManifest)
      }
      return
    }

    if (ctx.format === "ebook" || ctx.format === "readaloud") {
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
      ctx.pageCount = await deriveEbookPositionsCount(ctx, manifest)
      ctx.duration = deriveAudiobookDuration(manifest)
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
