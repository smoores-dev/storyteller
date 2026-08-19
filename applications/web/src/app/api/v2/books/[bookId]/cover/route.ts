import { withHasPermission } from "@/auth/auth"
import { getBook, getBookUuid } from "@/database/books"

export const dynamic = "force-dynamic"

type Params = Promise<{
  bookId: string
}>

/**
 * @summary Get the cover image for a book
 * @desc Superseded by `/api/v2/images/{sha256}`, which addresses images by
 *       content instead of by book. This redirects there so existing clients
 *       and OPDS feeds keep working. Use the `audio` search param to get the
 *       audio cover, and `w`/`h` to ask for a size.
 */
export const GET = withHasPermission<Params>("bookRead", {
  allowBasicAuth: true,
})(async (request, context) => {
  const { bookId } = await context.params
  const bookUuid = await getBookUuid(bookId)

  const book = await getBook(bookUuid, request.auth.user.id)
  if (!book) return new Response(null, { status: 404 })

  const audio = typeof request.nextUrl.searchParams.get("audio") === "string"

  const image = audio
    ? book.audiobook?.coverImage
    : book.ebook?.coverImage ?? book.readaloud?.coverImage

  if (!image) {
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    })
  }

  const height = Number.parseInt(
    request.nextUrl.searchParams.get("h") ?? "0",
    10,
  )
  const width = Number.parseInt(
    request.nextUrl.searchParams.get("w") ?? "0",
    10,
  )
  const size = Math.max(
    Number.isNaN(height) ? 0 : height,
    Number.isNaN(width) ? 0 : width,
  )

  const location =
    size > 0
      ? `/api/v2/images/${image.sha256}?s=${size.toString()}`
      : `/api/v2/images/${image.sha256}`

  return new Response(null, {
    status: 307,
    headers: { Location: location },
  })
})
