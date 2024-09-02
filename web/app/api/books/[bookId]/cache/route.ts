import { deleteOriginals, deleteProcessed } from "@/assets"
import { withHasPermission } from "@/auth"
import { getBookUuid } from "@/database/books"

type Params = {
  bookId: string
}

export const DELETE = withHasPermission<Params>("book_process")(async (
  request,
  context,
) => {
  const bookUuid = getBookUuid(context.params.bookId)
  const url = request.nextUrl
  const includeOriginals = typeof url.searchParams.get("originals") === "string"

  await Promise.all([
    deleteProcessed(bookUuid),
    ...(includeOriginals ? [deleteOriginals(bookUuid)] : []),
  ])

  return new Response(null, { status: 204 })
})
