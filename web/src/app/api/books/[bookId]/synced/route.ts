import { createHash } from "node:crypto"
import { type FileHandle, open } from "node:fs/promises"

import { createReadableStreamFromReadable } from "@remix-run/node"
import contentDisposition from "content-disposition"

import { Epub } from "@storyteller-platform/epub/node"

import { withHasPermission } from "@/auth/auth"
import { getBook, getBookUuid } from "@/database/books"
import { logger } from "@/logging"

export const dynamic = "force-dynamic"

type Params = Promise<{
  bookId: string
}>

/**
 * @summary deprecated - Get the aligned EPUB file
 * @desc Supports HTTP range requests for pause-able downloads.
 */
export const GET = withHasPermission<Params>("bookDownload")(async (
  request,
  context,
) => {
  const { bookId } = await context.params
  const bookUuid = await getBookUuid(bookId)
  const book = await getBook(bookUuid, request.auth.user.id)
  if (!book?.readaloud?.filepath) {
    return Response.json(
      { message: `Could not find book with id ${bookId}` },
      { status: 404 },
    )
  }

  const ifRange = request.headers.get("If-Range")?.valueOf()
  const range = request.headers.get("Range")?.valueOf()
  const rangesString = range?.replace("bytes=", "")
  const rangeStrings = rangesString?.split(",")

  const filepath = book.readaloud.filepath
  const epub = await Epub.from(filepath)
  const title = await epub.getTitle()
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
    // We're only supporting single ranges for now
    rangeStrings?.length === 1 &&
    (!ifRange || ifRange === etag || ifRange === lastModified)

  if (partialResponse) {
    // We already ensured that rangeStrings has a length of 1
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const firstRangeString = rangeStrings[0]!

    const [startString, endString] = firstRangeString.trim().split("-") as [
      string,
      string,
    ]

    try {
      const parsedStart = parseInt(startString.trim(), 10)
      if (!Number.isNaN(parsedStart)) {
        start = parsedStart
      }
      const parsedEnd = parseInt(endString.trim(), 10)
      if (!Number.isNaN(parsedEnd)) {
        end = parsedEnd
      }
    } catch {
      // If the ranges weren't valid, then leave the defaults
    }
  }

  if (start > stats.size - 1) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${stats.size}` },
    })
  }

  const readStream = file.createReadStream({ start, end })
  readStream.on("error", (e) => {
    logger.error(e)
  })

  const readableStream = createReadableStreamFromReadable(readStream)

  return new Response(readableStream, {
    status: partialResponse ? 206 : 200,
    headers: {
      "Content-Disposition": contentDisposition(`${title}.epub`, {
        fallback: `${normalizedTitle}.epub`,
      }),
      "Content-Type": "application/epub+zip",
      "Content-Length": `${end - start + 1}`,
      "Accept-Ranges": "bytes",
      "Last-Modified": new Date(stats.mtime).toISOString(),
      Etag: etag,
      ...(partialResponse && {
        "Content-Range": `bytes ${start}-${end}/${stats.size}`,
      }),
    },
  })
})
