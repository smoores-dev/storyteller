import { withHasPermission } from "@/auth/auth"
import { getBookUuid } from "@/database/books"
import {
  type RestartMode,
  cancelProcessing,
  startProcessing,
} from "@/work/distributor"

export const dynamic = "force-dynamic"

type Params = Promise<{
  bookId: string
}>

/**
 * @summary Begin processing for a book
 * @desc Use the `restart` param to control restart behavior:
 *       - "full": Delete all cache files and restart from scratch
 *       - "transcription": Delete transcriptions and restart from transcription step
 *       - "sync": Keep all files, restart from sync step
 *       - omit or false: Continue from where left off
 */
export const POST = withHasPermission<Params>("bookProcess")(async (
  request,
  context,
) => {
  const { bookId } = await context.params
  const bookUuid = await getBookUuid(bookId)
  const url = request.nextUrl
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
