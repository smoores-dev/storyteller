import {
  writeExtractedAudiobookCover,
  writeExtractedEbookCover,
} from "@/assets/covers"
import { deleteAssets } from "@/assets/fs"
import {
  getInternalBookDirectory,
  getInternalReadaloudFilepath,
  getInternalEpubFilepath,
  getInternalOriginalAudioFilepath,
  getInternalEpubDirectory,
  getInternalReadaloudDirectory,
} from "@/assets/paths"
import { withHasPermission } from "@/auth/auth"
import {
  CreatorRelation,
  deleteBook,
  getBook,
  getBookUuid,
  SeriesRelation,
  updateBook,
} from "@/database/books"
import { UUID } from "@/uuid"
import { isProcessing, isQueued } from "@/work/distributor"
import { queueWritesToFiles } from "@/writeToFiles/fileWriteDistributor"
import { NextResponse } from "next/server"
import { rename } from "node:fs/promises"
import { join } from "node:path"

function isIso8601(dateString: string) {
  return dateString === new Date(dateString).toISOString()
}

function getField<Value>(formData: FormData, field: string) {
  const stringified = formData.get(field)?.valueOf() as string | undefined
  if (stringified === undefined) return stringified
  return JSON.parse(stringified) as Value
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
  const fields = new Set(
    formData.getAll("fields").map((entry) => entry.valueOf() as string),
  )
  const title = getField<string>(formData, "title")

  if (!title && fields.has("title")) {
    return NextResponse.json(
      { message: "Title must be a non-empty string" },
      { status: 405 },
    )
  }

  const language = getField<string | null>(formData, "language") ?? null
  const subtitle = getField<string | null>(formData, "subtitle") ?? null
  const description = getField<string | null>(formData, "description") ?? null
  const rating = getField<number | null>(formData, "rating") ?? null

  const publicationDate =
    getField<string | null>(formData, "publicationDate") ?? null

  if (
    publicationDate &&
    fields.has("publicationDate") &&
    !isIso8601(publicationDate)
  ) {
    return NextResponse.json(
      {
        message: "Invalid publicationDate",
      },
      { status: 405 },
    )
  }

  const status = getField<UUID>(formData, "status")
  if (!status && fields.has("status")) {
    return NextResponse.json(
      { message: "Status must not be undefined" },
      { status: 405 },
    )
  }

  const tags = formData
    .getAll("tags")
    .map((entry) => JSON.parse(entry.valueOf() as string) as string)

  const creators = formData
    .getAll("creators")
    .map((entry) => JSON.parse(entry.valueOf() as string) as CreatorRelation)

  const narrators = formData
    .getAll("narrators")
    .map((entry) => JSON.parse(entry.valueOf() as string) as string)

  if (fields.has("narrators")) {
    creators.push(
      ...narrators.map((name) => ({
        name,
        fileAs: name,
        role: "nrt" as const,
      })),
    )
  }

  const authors = formData
    .getAll("authors")
    .map((entry) => JSON.parse(entry.valueOf() as string) as string)

  if (fields.has("authors")) {
    creators.push(
      ...authors.map((name) => ({
        name,
        fileAs: name,
        role: "aut" as const,
      })),
    )
  }

  const series = formData
    .getAll("series")
    .map((entry) => JSON.parse(entry.valueOf() as string) as SeriesRelation)

  const collections = formData
    .getAll("collections")
    .map((entry) => entry.valueOf() as UUID)

  const book = await getBook(bookUuid, request.auth.user.id)
  if (!book) {
    return Response.json({ message: `Could not find book with id ${bookUuid}` })
  }

  const updated = await updateBook(
    bookUuid,
    {
      // We already confirmed that these are non-null above, if they're in
      // the fields array
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      ...(fields.has("title") && { title: title! }),
      ...(fields.has("subtitle") && { subtitle: subtitle }),
      ...(fields.has("language") && { language }),
      ...(fields.has("description") && { description }),
      ...(fields.has("rating") && { rating }),
      ...(fields.has("publicationDate") && { publicationDate }),
    },
    {
      ...(fields.has("creators") && { creators }),
      ...(fields.has("series") && { series }),
      ...(fields.has("collections") && { collections }),
      ...(fields.has("tags") && { tags }),
      ...(fields.has("status") && {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        status: { statusUuid: status!, userId: request.auth.user.id },
      }),
    },
    request.auth.user.id,
  )

  if (book.title !== updated.title) {
    await rename(
      getInternalBookDirectory(book),
      getInternalBookDirectory(updated),
    )
    if (updated.ebook?.filepath === getInternalEpubFilepath(book)) {
      await rename(
        join(getInternalEpubDirectory(updated), `${book.title}.epub`),
        getInternalEpubFilepath(updated),
      )
    }
    if (updated.readaloud?.filepath === getInternalReadaloudFilepath(book)) {
      await rename(
        join(getInternalReadaloudDirectory(updated), `${book.title}.epub`),
        getInternalReadaloudFilepath(updated),
      )
    }
    await updateBook(updated.uuid, null, {
      ...(updated.ebook?.filepath === getInternalEpubFilepath(book) && {
        ebook: { filepath: getInternalEpubFilepath(updated) },
      }),
      ...(updated.audiobook?.filepath ===
        getInternalOriginalAudioFilepath(book) && {
        audiobook: { filepath: getInternalOriginalAudioFilepath(updated) },
      }),
      ...(updated.readaloud?.filepath ===
        getInternalReadaloudFilepath(book) && {
        readaloud: { filepath: getInternalReadaloudFilepath(updated) },
      }),
    })
  }

  const textCover = formData.get("textCover")?.valueOf() as File | undefined
  const audioCover = formData.get("audioCover")?.valueOf() as File | undefined

  if (textCover) {
    await writeExtractedEbookCover(
      updated,
      textCover.name,
      await textCover.bytes(),
    )
  }
  if (audioCover) {
    await writeExtractedAudiobookCover(
      updated,
      audioCover.name,
      await audioCover.bytes(),
    )
  }

  void queueWritesToFiles(book.uuid, textCover, audioCover)

  return NextResponse.json(updated)
})

/**
 * @summary Get metadata for a book
 * @desc '
 */
export const GET = withHasPermission<Params>("bookRead")(async (
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

  return NextResponse.json({
    ...book,
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

  const includeAssets = request.nextUrl.searchParams.get("includeAssets")

  await deleteBook(book.uuid)
  if (includeAssets) {
    await deleteAssets(book, { all: includeAssets === "all" })
  }

  return new Response(null, { status: 204 })
})
