import { withHasPermission } from "@/auth/auth"
import { getBookUuid } from "@/database/books"
import { cancelProcessing, startProcessing } from "@/work/distributor"

export const dynamic = "force-dynamic"

type Params = Promise<{
  bookId: string
}>

/**
 * @summary Begin processing for a book
 * @desc Use the `restart` param to delete cache files. This will
 *       force processing to restart from scratch.
 */
export const POST = withHasPermission<Params>("bookProcess")(async (
  request,
  context,
) => {
  const { bookId } = await context.params
  const bookUuid = await getBookUuid(bookId)
  const url = request.nextUrl
  const restart = typeof url.searchParams.get("restart") === "string"

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
