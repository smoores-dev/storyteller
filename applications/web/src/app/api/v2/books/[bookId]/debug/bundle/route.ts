import { createDebugBundle } from "@/assets/debugBundle"
import { zipResponse } from "@/assets/zip"
import { withHasPermission } from "@/auth/auth"
import { getBook } from "@/database/books"
import { type UUID } from "@/uuid"

type Params = Promise<{ bookId: UUID }>

export const POST = withHasPermission<Params>("bookUpdate")(async (
  _request,
  { params },
) => {
  const { bookId } = await params
  const book = await getBook(bookId)

  if (!book) {
    return new Response("Book not found", { status: 404 })
  }

  return zipResponse(
    await createDebugBundle(book),
    `debug-bundle-${book.title}.zip`,
  )
})
