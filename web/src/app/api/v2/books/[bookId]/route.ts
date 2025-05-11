import {
  ProcessingTaskStatus,
  ProcessingTaskType,
} from "@/apiModels/models/ProcessingStatus"
import {
  deleteAssets,
  originalAudioExists,
  originalEpubExists,
} from "@/assets/assets"
import {
  persistCustomEpubCover,
  persistCustomAudioCover,
} from "@/assets/covers"
import { getEpubAlignedFilepath } from "@/assets/paths"
import { withHasPermission } from "@/auth"
import {
  AuthorRelation,
  deleteBook,
  getBook,
  getBookUuid,
  SeriesRelation,
  updateBook,
} from "@/database/books"
import { writeMetadataToEpub } from "@/process/processEpub"
import { UUID } from "@/uuid"
import { isProcessing, isQueued } from "@/work/distributor"
import { Epub } from "@smoores/epub"
import { extension } from "mime-types"
import { NextResponse } from "next/server"

function isIso8601(dateString: string) {
  return dateString === new Date(dateString).toISOString()
}

export const dynamic = "force-dynamic"

type Params = Promise<{
  bookId: string
}>

/**
 * @summary Update a book's metadata
 * @desc Any new metadata will also be encoded in the aligned EPUB file
 *       itself.
 */
export const PUT = withHasPermission<Params>("bookUpdate")(async (
  request,
  context,
) => {
  const { bookId } = await context.params
  const bookUuid = await getBookUuid(bookId)
  const formData = await request.formData()
  const title = formData.get("title")?.valueOf()
  if (typeof title !== "string") {
    return NextResponse.json(
      { message: "Book must have a title" },
      { status: 405 },
    )
  }

  const language = formData.get("language")?.valueOf() ?? null
  if (typeof language !== "string" && language !== null) {
    return NextResponse.json(
      {
        message: "Invalid language",
      },
      { status: 405 },
    )
  }

  const publicationDate = formData.get("publicationDate")?.valueOf() ?? null
  if (
    (typeof publicationDate !== "string" && publicationDate !== null) ||
    (publicationDate && !isIso8601(publicationDate))
  ) {
    return NextResponse.json(
      {
        message: "Invalid publicationDate",
      },
      { status: 405 },
    )
  }

  const statusUuid = formData.get("statusUuid")?.valueOf()
  if (typeof statusUuid !== "string") {
    return NextResponse.json(
      { message: "Book must have a status" },
      { status: 405 },
    )
  }

  const tags = formData.getAll("tags").map((entry) => entry.valueOf() as string)

  const authors = formData
    .getAll("authors")
    .map((entry) => JSON.parse(entry.valueOf() as string) as AuthorRelation)

  const series = formData
    .getAll("series")
    .map((entry) => JSON.parse(entry.valueOf() as string) as SeriesRelation)

  const collections = formData
    .getAll("collections")
    .map((entry) => entry.valueOf() as UUID)

  const updated = await updateBook(
    bookUuid,
    { title, language, statusUuid: statusUuid as UUID, publicationDate },
    { authors, series, collections, tags },
  )

  const textCover = formData.get("textCover")?.valueOf()
  if (typeof textCover === "object") {
    const textCoverFile = textCover as File
    const ext = extension(textCoverFile.type)
    const arrayBuffer = await textCoverFile.arrayBuffer()
    const data = new Uint8Array(arrayBuffer)
    await persistCustomEpubCover(bookUuid, `Cover.${ext}`, data)
  }

  const audioCover = formData.get("audioCover")?.valueOf()
  if (typeof audioCover === "object") {
    const audioCoverFile = audioCover as File
    const ext = extension(audioCoverFile.type)
    const arrayBuffer = await audioCoverFile.arrayBuffer()
    const data = new Uint8Array(arrayBuffer)
    await persistCustomAudioCover(bookUuid, `Audio Cover.${ext}`, data)
  }

  if (
    updated.processingTask?.type === ProcessingTaskType.SYNC_CHAPTERS &&
    updated.processingTask.status === ProcessingTaskStatus.COMPLETED
  ) {
    const alignedEpubPath = getEpubAlignedFilepath(updated.uuid)
    const epub = await Epub.from(alignedEpubPath)
    await writeMetadataToEpub(updated, epub)
    await epub.writeToFile(alignedEpubPath)
    await epub.close()
  }

  return NextResponse.json(updated)
})

/**
 * @summary Get metadata for a book
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

  return NextResponse.json({
    ...book,
    originalFilesExist: (
      await Promise.all([
        originalEpubExists(book.uuid),
        originalAudioExists(book.uuid),
      ])
    ).every((originalsExist) => originalsExist),
    processingStatus: isProcessing(book.uuid)
      ? "processing"
      : isQueued(book.uuid)
        ? "queued"
        : null,
  })
})

/**
 * @summary Delete a book
 * @desc Will also delete all files associated with the book from disk.
 */
export const DELETE = withHasPermission<Params>("bookDelete")(async (
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

  await deleteBook(book.uuid)
  await deleteAssets(book.uuid)

  return new Response(null, { status: 204 })
})
