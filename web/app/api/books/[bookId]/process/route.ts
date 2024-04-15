import { deleteProcessed } from "@/assets"
import { withHasPermission } from "@/auth"
import { getBookUuid } from "@/database/books"
import { startProcessing } from "@/work/distributor"

export const dynamic = "force-dynamic"

type Params = {
  bookId: string
}

export const POST = withHasPermission<Params>("book_process")(async (
  request,
  context,
) => {
  const bookUuid = await getBookUuid(context.params.bookId)
  const url = request.nextUrl
  const restart = typeof url.searchParams.get("restart") === "string"

  if (restart) {
    await deleteProcessed(bookUuid)
  }

  void startProcessing(bookUuid)

  return new Response(null, { status: 204 })
})
