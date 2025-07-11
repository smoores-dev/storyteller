import { originalAudioExists, originalEpubExists } from "@/assets/fs"
import { withHasPermission } from "@/auth/auth"
import { getBooks } from "@/database/books"
import { NextResponse } from "next/server"
import { isProcessing, isQueued } from "@/work/distributor"

export const dynamic = "force-dynamic"

/**
 * @summary List all books in the library
 * @desc Use the `alignedOnly` param to limit results to books that
 *       have been aligned by Storyteller successfully.
 */
export const GET = withHasPermission("bookList")(async (request) => {
  const url = request.nextUrl
  const alignedOnly = url.searchParams.get("aligned")

  const books = await getBooks(null, alignedOnly !== null)

  return NextResponse.json(
    await Promise.all(
      books.map(async (book) => {
        return {
          ...book,
          originalFilesExist: (
            await Promise.all([
              originalEpubExists(book),
              originalAudioExists(book),
            ])
          ).every((originalsExist) => originalsExist),
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
