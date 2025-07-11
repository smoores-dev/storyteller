import { withHasPermission } from "@/auth/auth"
import { getBookUuid, getBook } from "@/database/books"

export const dynamic = "force-dynamic"

type Params = Promise<{
  bookId: string
}>

/**
 * @summary deprecated - Get metadata for a book
 * @desc '
 */
export const GET = withHasPermission<Params>("bookRead")(async (
  _request,
  context,
) => {
  const { bookId } = await context.params
  const bookUuid = await getBookUuid(bookId)
  const book = await getBook(bookUuid)
  if (!book) {
    return Response.json(
      { message: `Could not find book with id ${bookId}` },
      { status: 404 },
    )
  }

  return Response.json({
    id: book.id,
    title: book.title,
    authors: book.authors.map((author) => ({
      name: author.name,
      file_as: author.fileAs,
      role: author.role,
    })),
    processing_status: null,
  })
})
