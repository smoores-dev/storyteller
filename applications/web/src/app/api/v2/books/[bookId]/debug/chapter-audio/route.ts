import { Epub } from "@storyteller-platform/epub"

import { readChapterAudio } from "@/assets/chapterAudio"
import { findMediaOverlay } from "@/assets/mediaOverlay"
import {
  getEmissionsFilepath,
  getTranscriptionsFilepath,
} from "@/assets/paths"
import { withHasPermission } from "@/auth/auth"
import { getBook } from "@/database/books"
import { type UUID } from "@/uuid"

type Params = Promise<{ bookId: UUID }>

export const GET = withHasPermission<Params>("bookUpdate")(async (
  request,
  { params },
) => {
  const { bookId } = await params
  const href = request.nextUrl.searchParams.get("href")

  if (!href) {
    return new Response("Missing href", { status: 400 })
  }

  const book = await getBook(bookId)

  if (!book) {
    return new Response("Book not found", { status: 404 })
  }

  const asset = book.readaloud

  if (!asset?.filepath || asset.missing) {
    return new Response("Book has no readaloud file", { status: 404 })
  }

  using epub = await Epub.from(asset.filepath)
  const overlay = await findMediaOverlay(epub, href)

  if (!overlay) {
    return new Response("Chapter has no media overlay", { status: 404 })
  }

  return Response.json(
    await readChapterAudio(epub, overlay, {
      emissions: getEmissionsFilepath(book),
      transcriptions: getTranscriptionsFilepath(book),
    }),
  )
})
