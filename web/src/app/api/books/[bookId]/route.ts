import {
  ProcessingTaskType,
  ProcessingTaskStatus,
} from "@/apiModels/models/ProcessingStatus"
import { getEpubAlignedFilepath, getEpubFilepath } from "@/assets/paths"
import { withHasPermission } from "@/auth/auth"
import { getBookUuid, getBook } from "@/database/books"
import { Epub } from "@smoores/epub"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

type Params = Promise<{
  bookId: string
}>

/**
 * @summary deprecated - Get metadata for a book
 * @desc '
 */
export const GET = withHasPermission<Params>("bookRead")(async (
  _request,
  context,
) => {
  const { bookId } = await context.params
  const bookUuid = await getBookUuid(bookId)
  const book = await getBook(bookUuid)
  if (!book) {
    return NextResponse.json(
      { message: `Could not find book with id ${bookId}` },
      { status: 404 },
    )
  }

  if (!book.language) {
    const synchronized =
      book.processingTask?.type === ProcessingTaskType.SYNC_CHAPTERS &&
      book.processingTask.status === ProcessingTaskStatus.COMPLETED
    const epubPath = synchronized
      ? getEpubAlignedFilepath(book.uuid)
      : getEpubFilepath(book.uuid)
    const epub = await Epub.from(epubPath)
    const locale = await epub.getLanguage()
    if (locale) {
      book.language = locale.toString()
    }
  }

  return NextResponse.json({
    id: book.id,
    title: book.title,
    authors: book.authors.map((author) => ({
      name: author.name,
      file_as: author.fileAs,
      role: author.role,
    })),
    processing_status: null,
  })
})
