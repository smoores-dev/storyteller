import { createReadableStreamFromReadable } from "@remix-run/node"
import contentDisposition from "content-disposition"

import { createDebugBundle } from "@/assets/debugBundle"
import { withHasPermission } from "@/auth/auth"
import { getBook } from "@/database/books"
import { type UUID } from "@/uuid"

type Params = Promise<{ bookId: UUID }>

export const GET = withHasPermission<Params>("bookUpdate")(async (
  _request,
  { params },
) => {
  const { bookId } = await params
  const book = await getBook(bookId)

  if (!book) {
    return new Response("Book not found", { status: 404 })
  }

  return new Response(
    createReadableStreamFromReadable(await createDebugBundle(book)),
    {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": contentDisposition(
          `debug-bundle-${book.title}.zip`,
        ),
      },
    },
  )
})
