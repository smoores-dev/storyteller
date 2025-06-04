import { withHasPermission } from "@/auth/auth"
import { getBooks } from "@/database/books"
import { NextResponse } from "next/server"

/**
 * @summary deprecated - List all books in the library
 * @desc Use the `synced` param to limit results to books that
 *       have been aligned by Storyteller successfully.
 */
export const GET = withHasPermission("bookList")(async (request) => {
  const url = request.nextUrl
  const alignedOnly = url.searchParams.get("synced")

  const books = await getBooks(null, alignedOnly !== null)

  return NextResponse.json(
    books.map((book) => ({
      id: book.id,
      title: book.title,
      authors: book.authors.map((author) => ({
        name: author.name,
        file_as: author.fileAs,
        role: author.role,
      })),
      processing_status: null,
    })),
  )
})
