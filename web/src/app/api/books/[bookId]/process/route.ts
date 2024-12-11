import { withHasPermission } from "@/auth"
import { getBookUuid } from "@/database/books"
import { cancelProcessing, startProcessing } from "@/work/distributor"

export const dynamic = "force-dynamic"

type Params = Promise<{
  bookId: string
}>

export const POST = withHasPermission<Params>("book_process")(async (
  request,
  context,
) => {
  const { bookId } = await context.params
  const bookUuid = getBookUuid(bookId)
  const url = request.nextUrl
  const restart = typeof url.searchParams.get("restart") === "string"

  void startProcessing(bookUuid, restart)

  return new Response(null, { status: 204 })
})

export const DELETE = withHasPermission<Params>("book_process")(async (
  _request,
  context,
) => {
  const { bookId } = await context.params
  const bookUuid = getBookUuid(bookId)

  cancelProcessing(bookUuid)

  return new Response(null, { status: 204 })
})
