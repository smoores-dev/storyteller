import { readdir } from "node:fs/promises"

import { isHiddenFile } from "@storyteller-platform/fs"

import { normalizeReport } from "@/alignmentReportView"
import { getProcessedAudioFilepath } from "@/assets/paths"
import { getTrackDuration, isAudioFile } from "@/audio"
import { withHasPermission } from "@/auth/auth"
import { getAlignmentReportForBook } from "@/database/alignmentReports"
import { getBook } from "@/database/books"
import { logger } from "@/logging"
import { type TranscodedAudioFile } from "@/schemas/v2/transcodedAudio"
import type { UUID } from "@/uuid"

export const dynamic = "force-dynamic"

type Params = Promise<{ bookId: string }>

const PROBE_CONCURRENCY = 4

async function probeDurations(filepaths: string[]): Promise<(number | null)[]> {
  const durations: (number | null)[] = new Array<number | null>(
    filepaths.length,
  ).fill(null)
  let next = 0

  async function worker() {
    while (next < filepaths.length) {
      const index = next++
      const filepath = filepaths[index]
      if (!filepath) continue
      try {
        const duration = await getTrackDuration(filepath)
        durations[index] = Number.isFinite(duration) ? duration : null
      } catch (error) {
        logger.debug({
          msg: "Failed to probe transcoded audio duration",
          filepath,
          err: error,
        })
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(PROBE_CONCURRENCY, filepaths.length) }, () =>
      worker(),
    ),
  )

  return durations
}

/**
 * @description List a book's transcoded audio files and their durations
 * @pathParams BookIdParamsSchemaV2
 * @response TranscodedAudioFilesSchemaV2
 * @auth bearer
 * @openapi
 */
export const GET = withHasPermission<Params>("bookRead")(async (
  request,
  context,
) => {
  const { bookId } = await context.params
  const bookUuid = bookId as UUID

  const book = await getBook(bookUuid, request.auth.user.id)
  if (!book) {
    return Response.json({ message: "Book not found" }, { status: 404 })
  }

  const directory = getProcessedAudioFilepath(book)

  let entries: string[] = []
  try {
    entries = await readdir(directory)
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ENOENT"
    ) {
      throw error
    }
  }

  const names = entries
    .filter((name) => !isHiddenFile(name) && isAudioFile(name))
    .sort((a, b) => a.localeCompare(b))

  const durations = await probeDurations(
    names.map((name) => getProcessedAudioFilepath(book, name)),
  )

  const files: TranscodedAudioFile[] = names.map((name, index) => ({
    name,
    duration: durations[index] ?? null,
    present: true,
  }))

  const report = await getAlignmentReportForBook(bookUuid)
  if (report?.report) {
    const onDisk = new Set(names)
    for (const track of normalizeReport(report.report).tracks) {
      if (onDisk.has(track.name)) continue
      files.push({
        name: track.name,
        duration: track.duration > 0 ? track.duration : null,
        present: false,
      })
    }
  }

  return Response.json(files, {
    headers: { "Cache-Control": "no-store" },
  })
})
