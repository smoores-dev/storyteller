import { withHasPermission } from "@/auth/auth"
import { getBookUuid, getBook, BookWithRelations } from "@/database/books"
import contentDisposition from "content-disposition"
import { createHash } from "node:crypto"
import { FileHandle, open } from "node:fs/promises"

type Params = Promise<{
  bookId: string
}>

function determineFilepath(
  book: BookWithRelations,
  format: "readaloud" | "audiobook" | "ebook" | null,
) {
  if (!format) {
    const filepath =
      book.readaloud?.filepath ??
      book.audiobook?.filepath ??
      book.ebook?.filepath

    return filepath
  }

  return book[format]?.filepath
}

/**
 * @summary Get files for a book
 * @desc The format query param should be specified as one of 'readaloud',
 *       'audiobook', or 'ebook'. This endpoint supports resumable downloads via
 *       HTTP Accept-Ranges headers.
 */
export const GET = withHasPermission<Params>("bookRead")(async (
  request,
  context,
) => {
  const { bookId } = await context.params
  const bookUuid = await getBookUuid(bookId)
  const book = await getBook(bookUuid, request.auth.user.id)
  if (!book) {
    return Response.json(
      { message: `Could not find book with id ${bookId}` },
      { status: 404 },
    )
  }

  const range = request.headers.get("Range")?.valueOf()
  const ifRange = request.headers.get("If-Range")?.valueOf()

  const format = request.nextUrl.searchParams.get("format") as
    | "readaloud"
    | "ebook"
    | "audiobook"
    | null

  const filepath = determineFilepath(book, format)
  if (!filepath) return new Response(null, { status: 404 })

  const normalizedTitle = book.title
    .normalize("NFD")
    .replaceAll(/\p{Diacritic}/gu, "")
    .replaceAll(/[^a-zA-Z0-9-_.~!#$&'()*+,/:;=?@[\] ]/gu, "")

  let file: FileHandle
  try {
    file = await open(filepath)
  } catch (_) {
    return Response.json(
      { message: `Could not find book with id ${bookId}` },
      { status: 404 },
    )
  }

  const stats = await file.stat()
  const lastModified = new Date(stats.mtime).toISOString()
  const etagBase = `${stats.mtime.valueOf()}-${stats.size}`
  const etag = `"${createHash("md5").update(etagBase).digest("hex")}"`

  let start = 0
  let end = stats.size - 1

  const partialResponse =
    range?.startsWith("bytes=") &&
    (!ifRange || ifRange === etag || ifRange === lastModified)

  if (partialResponse) {
    // partialResponse is only true if the range exists
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const rangesString = range!.replace("bytes=", "")
    const rangeStrings = rangesString.split(",")
    const ranges = rangeStrings.map((rangeString) =>
      rangeString.trim().split("-"),
    )
    try {
      const [[startString, endString]] = ranges as [[string, string]]
      const parsedStart = parseInt(startString.trim(), 10)
      if (!Number.isNaN(parsedStart)) {
        start = parsedStart
      }
      const parsedEnd = parseInt(endString.trim(), 10)
      if (!Number.isNaN(parsedEnd)) {
        end = parsedEnd
      }
    } catch (_) {
      // If the ranges weren't valid, then leave the defaults
    }
  }

  if (end > stats.size - 1) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${stats.size}` },
    })
  }

  // @ts-expect-error Response handle Node.js ReadStreams just fine
  return new Response(file.createReadStream({ start, end }), {
    status: partialResponse ? 206 : 200,
    headers: {
      "Content-Disposition": contentDisposition(`${book.title}.epub`, {
        fallback: `${normalizedTitle}.epub`,
      }),
      "Content-Type": "application/epub+zip",
      "Content-Length": `${end - start + 1}`,
      "Last-Modified": new Date(stats.mtime).toISOString(),
      Etag: etag,
      ...(partialResponse && {
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes ${start}-${end}/${stats.size}`,
      }),
    },
  })
})
