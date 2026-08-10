import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { getBook, getBookUuid } from "@/database/books"
import {
  attachCover,
  audioCoverTargets,
  extractAudioCover,
  extractTextCover,
  ingestCover,
  textCoverTargets,
} from "@/images/covers"

export const dynamic = "force-dynamic"

type Params = Promise<{
  bookId: string
}>

/**
 * @summary Re-read a book's cover from its source files
 * @desc Runs the same extraction the library scanner does, but on demand and
 *       ignoring cover provenance, so it also restores a cover the user
 *       previously removed. Pass `format` as `text` (the default) or `audio`.
 */
export const POST = withHasPermission<Params>("bookUpdate")(async (
  request,
  context,
) => {
  const { bookId } = await context.params
  const bookUuid = await getBookUuid(bookId)

  const book = await getBook(bookUuid, request.auth.user.id)
  if (!book) {
    return NextResponse.json(
      { message: `Could not find book with id ${bookId}` },
      { status: 404 },
    )
  }

  const format = request.nextUrl.searchParams.get("format") ?? "text"

  const cover =
    format === "audio"
      ? await extractAudioCover({
          audiobook: book.audiobook?.filepath ?? null,
          readaloud: book.readaloud?.filepath ?? null,
          audiobookDir: book.audiobook?.filepath ?? null,
        })
      : await extractTextCover({
          ebook: book.ebook?.filepath ?? null,
          readaloud: book.readaloud?.filepath ?? null,
        })

  if (!cover) {
    return NextResponse.json(
      { message: "No cover art was found in this book's files" },
      { status: 404 },
    )
  }

  const image = await ingestCover(cover)
  if (!image) {
    return NextResponse.json(
      { message: "The cover art in this book's files could not be read" },
      { status: 415 },
    )
  }

  const targets =
    format === "audio" ? audioCoverTargets(book) : textCoverTargets(book)

  await attachCover(book.uuid, targets, image, "extracted")

  return NextResponse.json(image)
})
