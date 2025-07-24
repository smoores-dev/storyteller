import { withHasPermission } from "@/auth/auth"
import { deleteBook, getBooks } from "@/database/books"
import { NextResponse } from "next/server"
import { isProcessing, isQueued } from "@/work/distributor"
import { UUID } from "@/uuid"
import { deleteAssets } from "@/assets/fs"

export const dynamic = "force-dynamic"

/**
 * @summary List all books in the library
 * @desc Use the `alignedOnly` param to limit results to books that
 *       have been aligned by Storyteller successfully.
 */
export const GET = withHasPermission("bookList")(async (request) => {
  const books = await getBooks(null, request.auth.user.id)

  return NextResponse.json(
    await Promise.all(
      books.map((book) => {
        return {
          ...book,
          processingStatus: isProcessing(book.uuid)
            ? "processing"
            : isQueued(book.uuid)
              ? "queued"
              : null,
        }
      }),
    ),
  )
})

export const DELETE = withHasPermission("bookDelete")(async (request) => {
  const { books: bookUuids, includeAssets } = (await request.json()) as {
    books: UUID[]
    includeAssets?: "all" | "internal"
  }
  const books = await getBooks(bookUuids, request.auth.user.id)

  if (books.length !== bookUuids.length) {
    return Response.json({ message: "Not found" }, { status: 404 })
  }

  for (const book of books) {
    await deleteBook(book.uuid)
    if (includeAssets) {
      await deleteAssets(book, { all: includeAssets === "all" })
    }
  }

  return new Response(null, { status: 204 })
})
