import { withHasPermission } from "@/auth"
import { getBookUuid } from "@/database/books"
import { getEpubSyncedFilepath } from "@/process/processEpub"
import { FileHandle, open } from "node:fs/promises"
import { NextResponse } from "next/server"
import { createHash } from "node:crypto"
import { Epub } from "@/epub"

export const dynamic = "force-dynamic"

type Params = Promise<{
  bookId: string
}>

export const GET = withHasPermission<Params>("book_download")(async (
  request,
  context,
) => {
  const { bookId } = await context.params
  const bookUuid = getBookUuid(bookId)
  const range = request.headers.get("Range")?.valueOf()
  const ifRange = request.headers.get("If-Range")?.valueOf()
  const filepath = getEpubSyncedFilepath(bookUuid)
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
    return NextResponse.json(
      { message: `Could not find book with id ${bookId}` },
      { status: 404 },
    )
  }

  const stat = await file.stat()
  const lastModified = new Date(stat.mtime).toISOString()
  const etagBase = `${stat.mtime.valueOf()}-${stat.size}`
  const etag = `"${createHash("md5").update(etagBase).digest("hex")}"`

  let start = 0
  let end = stat.size

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

  // @ts-expect-error NextResponse handle Node.js ReadStreams just fine
  return new NextResponse(file.createReadStream({ start, end: end - 1 }), {
    status: partialResponse ? 206 : 200,
    headers: {
      "Content-Disposition": `attachment; filename="${normalizedTitle}.epub"`,
      "Content-Type": "application/epub+zip",
      "Accept-Ranges": "bytes",
      "Content-Length": `${end - start}`,
      "Last-Modified": new Date(stat.mtime).toISOString(),
      Etag: etag,
    },
  })
})
