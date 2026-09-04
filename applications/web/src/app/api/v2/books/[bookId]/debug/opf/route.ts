import { Epub, MemoryAdapter } from "@storyteller-platform/epub"

import { withHasPermission } from "@/auth/auth"
import { getBook } from "@/database/books"
import { type UUID } from "@/uuid"

type Params = Promise<{ bookId: UUID }>

export const GET = withHasPermission<Params>("bookUpdate")(async (
  request,
  { params },
) => {
  const { bookId } = await params
  const format =
    request.nextUrl.searchParams.get("format") === "readaloud"
      ? "readaloud"
      : "ebook"

  const book = await getBook(bookId)

  if (!book) {
    return new Response("Book not found", { status: 404 })
  }

  const asset = book[format]

  if (!asset?.filepath || asset.missing) {
    return new Response(`Book has no ${format} file`, { status: 404 })
  }

  const source = await Epub.using(MemoryAdapter).readPackageDocumentSource(
    asset.filepath,
  )

  return new Response(source, {
    headers: {
      "Content-Type": "application/oebps-package+xml; charset=utf-8",
    },
  })
})
