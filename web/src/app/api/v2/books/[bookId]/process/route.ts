import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { getBookUuid } from "@/database/books"
import { db } from "@/database/connection"
import { env } from "@/env"
import {
  type RestartMode,
  cancelProcessing,
  startProcessing,
} from "@/work/distributor"

export const dynamic = "force-dynamic"

type Params = Promise<{
  bookId: string
}>

function isCpuVariant(variant: string): boolean {
  return variant.includes("cpu") || variant.includes("blas")
}

async function shouldShowGpuWarning(): Promise<
  | {
      showWarning: true
      variant: string | undefined
      whisperBuild: string | null
    }
  | { showWarning: false; variant?: never; whisperBuild?: never }
> {
  const variant = env.STORYTELLER_WHISPER_VARIANT
  if (!variant || !isCpuVariant(variant)) return { showWarning: false }

  const row = await db
    .selectFrom("settings")
    .select("value")
    .where("name", "=", "whisperBuild" as never)
    .executeTakeFirst()

  if (!row) return { showWarning: false }

  const whisperBuild =
    typeof row.value === "string"
      ? (JSON.parse(row.value) as string | null)
      : null

  if (!whisperBuild || whisperBuild === "cpu") {
    return { showWarning: false }
  }

  return { showWarning: true, variant, whisperBuild }
}

async function dismissGpuWarning(): Promise<void> {
  await db
    .updateTable("settings")
    .set({ value: JSON.stringify("cpu") })
    .where("name", "=", "whisperBuild" as never)
    .execute()
}

/**
 * @summary Begin processing for a book
 * @desc Use the `restart` param to control restart behavior:
 *       - "full": Delete all cache files and restart from scratch
 *       - "transcription": Delete transcriptions and restart from transcription step
 *       - "sync": Keep all files, restart from sync step
 *       - omit or false: Continue from where left off
 *
 *       Use the `gpuWarning` param to check or dismiss the GPU build
 *       migration warning. When omitted, no check is performed (for
 *       non-web API clients). The bookId path segment is ignored when
 *       gpuWarning is "check".
 *       - "check": Return { showWarning: boolean } without processing.
 *       - "dismiss": Set whisperBuild to "cpu", then process the book.
 */
export const POST = withHasPermission<Params>("bookProcess")(async (
  request,
  context,
) => {
  const url = request.nextUrl
  const gpuWarning = url.searchParams.get("gpuWarning")

  if (gpuWarning === "check") {
    const result = await shouldShowGpuWarning()
    if (result.showWarning) {
      return NextResponse.json(result)
    }
  }

  if (gpuWarning === "dismiss") {
    await dismissGpuWarning()
  }

  const { bookId } = await context.params
  const bookUuid = await getBookUuid(bookId)
  const restartParam = url.searchParams.get("restart")

  let restart: RestartMode = false
  if (restartParam === "full" || restartParam === "true") {
    restart = "full"
  } else if (restartParam === "transcription") {
    restart = "transcription"
  } else if (restartParam === "sync") {
    restart = "sync"
  }

  void startProcessing(bookUuid, restart)

  return new Response(null, { status: 204 })
})

/**
 * @summary Cancel processing for a book
 * @desc '
 */
export const DELETE = withHasPermission<Params>("bookProcess")(async (
  _request,
  context,
) => {
  const { bookId } = await context.params
  const bookUuid = await getBookUuid(bookId)

  cancelProcessing(bookUuid)

  return new Response(null, { status: 204 })
})
