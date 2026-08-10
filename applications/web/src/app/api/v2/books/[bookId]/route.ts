import { NextResponse } from "next/server"

import { type JsColor } from "@storyteller-platform/okmain"

import { deleteAssets } from "@/assets/fs"
import { withHasPermission } from "@/auth/auth"
import {
  type CreatorRelation,
  type IdentifierRelation,
  type SeriesRelation,
  type UserBookRatingRelation,
  deleteBook,
  getBook,
  getBookUuid,
  updateBook,
} from "@/database/books"
import { toIsoDateString } from "@/dates"
import { ingestImage } from "@/images"
import {
  attachCover,
  audioCoverTargets,
  textCoverTargets,
} from "@/images/covers"
import { sweepUnreferencedImages } from "@/images/gc"
import { type UUID } from "@/uuid"
import { queueWritesToFiles } from "@/writeToFiles/fileWriteDistributor"

// This is just a convenience to avoid type casting at the call site
/* eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters */
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
  const pageCount = getField<number | null>(formData, "pageCount") ?? null
  const duration = getField<number | null>(formData, "duration") ?? null

  // null means delete the rating
  const userBookRating = getField<UserBookRatingRelation | null>(
    formData,
    "userBookRating",
  )
  if (
    userBookRating &&
    userBookRating.rating == null &&
    userBookRating.review == null
  ) {
    return NextResponse.json(
      {
        message:
          "Either rating or review, or both must be provided when updating a rating",
      },
      { status: 405 },
    )
  }

  // zod where are you i need you
  if (
    userBookRating &&
    userBookRating.rating != null &&
    !isNaN(userBookRating.rating) &&
    (userBookRating.rating < 0 || userBookRating.rating > 5)
  ) {
    return NextResponse.json(
      {
        message: "Rating must be a number between 0 and 5",
      },
      { status: 405 },
    )
  }

  // manual cover-palette override. null (or [] normalized to null) clears it back
  // to the per-format colors ("reread from cover").
  const coverColorsOverride = getField<JsColor[] | null>(
    formData,
    "coverColorsOverride",
  )

  const publicationDateInput =
    getField<string | null>(formData, "publicationDate") ?? null

  // a year, a "yyyy-MM-dd" date and a full timestamp are all valid input
  const publicationDate = publicationDateInput
    ? toIsoDateString(publicationDateInput)
    : null

  if (
    publicationDateInput &&
    fields.has("publicationDate") &&
    !publicationDate
  ) {
    return NextResponse.json(
      {
        message: `"${publicationDateInput}" is not a valid publication date. Use a year, YYYY-MM-DD, or a full ISO timestamp.`,
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

  const identifiers = formData
    .getAll("identifiers")
    .map((entry) => JSON.parse(entry.valueOf() as string) as IdentifierRelation)

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
      ...(fields.has("publicationDate") && { publicationDate }),
      ...(fields.has("pageCount") && { pageCount }),
      ...(fields.has("duration") && { duration }),
      ...(fields.has("coverColorsOverride") && {
        coverColorsOverride:
          coverColorsOverride && coverColorsOverride.length > 0
            ? JSON.stringify(coverColorsOverride)
            : null,
      }),
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
      ...(fields.has("userBookRating") && {
        userBookRating: userBookRating
          ? { ...userBookRating, userId: request.auth.user.id }
          : { userId: request.auth.user.id },
      }),
      ...(fields.has("identifiers") && { identifiers }),
    },
    request.auth.user.id,
  )

  const textCover = formData.get("textCover")?.valueOf() as File | undefined
  const audioCover = formData.get("audioCover")?.valueOf() as File | undefined

  // the text cover backs both the ebook and the readaloud display
  if (textCover) {
    const image = await ingestCoverFile(textCover)
    if (image) {
      await attachCover(updated.uuid, textCoverTargets(updated), image, "user")
    }
  }

  if (audioCover) {
    const image = await ingestCoverFile(audioCover)
    if (image) {
      await attachCover(updated.uuid, audioCoverTargets(updated), image, "user")
    }
  }

  void queueWritesToFiles(book.uuid, textCover, audioCover)

  return NextResponse.json(updated)
})

async function ingestCoverFile(file: File) {
  return await ingestImage(Buffer.from(await file.arrayBuffer()), {
    sourceName: file.name,
  })
}

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

  return NextResponse.json(book)
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

  const preventReImport =
    request.nextUrl.searchParams.get("preventReImport") === "true"

  await deleteBook(book.uuid, { preventReImport })
  await deleteAssets(book)
  await sweepUnreferencedImages()

  return new Response(null, { status: 204 })
})
