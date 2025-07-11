import { withHasPermission } from "@/auth/auth"
import { getBook, getBookUuid } from "@/database/books"
import { FileHandle, open } from "node:fs/promises"
import { NextResponse } from "next/server"
import { createHash } from "node:crypto"
import { Epub } from "@smoores/epub/node"
import contentDisposition from "content-disposition"

export const dynamic = "force-dynamic"

type Params = Promise<{
  bookId: string
}>

/**
 * @summary Get the aligned EPUB file
 * @desc Supports HTTP range requests for pause-able downloads.
 */
export const GET = withHasPermission<Params>("bookDownload")(async (
  request,
  context,
) => {
  const { bookId } = await context.params
  const bookUuid = await getBookUuid(bookId)
  const range = request.headers.get("Range")?.valueOf()
  const ifRange = request.headers.get("If-Range")?.valueOf()
  const book = await getBook(bookUuid)

  if (!book?.alignedBook?.filepath) {
    return Response.json(
      { message: `Could not find book with id ${bookId}` },
      { status: 404 },
    )
  }

  const filepath = book.alignedBook.filepath
  const epub = await Epub.from(filepath)
  const title = await epub.getTitle(true)
  const normalizedTitle =
    title
      ?.normalize("NFD")
      .replaceAll(/\p{Diacritic}/gu, "")
      .replaceAll(/[^a-zA-Z0-9-_.~!#$&'()*+,/:;=?@[\] ]/gu, "") ?? bookUuid

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
    return new NextResponse(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${stats.size}` },
    })
  }

  // @ts-expect-error NextResponse handle Node.js ReadStreams just fine
  return new NextResponse(file.createReadStream({ start, end }), {
    status: partialResponse ? 206 : 200,
    headers: {
      "Content-Disposition": contentDisposition(`${title}.epub`, {
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
