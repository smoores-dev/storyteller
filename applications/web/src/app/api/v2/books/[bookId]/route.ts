import { NextResponse } from "next/server"
import z from "zod"

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
import { ingestImage } from "@/images"
import {
  attachCover,
  audioCoverTargets,
  textCoverTargets,
} from "@/images/covers"
import { sweepUnreferencedImages } from "@/images/gc"
import { logger } from "@/logging"
import { BookSchemaV2, BookUpdateRequestSchemaV2 } from "@/schemas/v2/book"
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
  bookId: UUID
}>

function parseFormDataFields(formData: FormData) {
  return {
    fields: Array.from(
      new Set(
        formData.getAll("fields").map((entry) => entry.valueOf() as string),
      ),
    ),
    title: getField<string>(formData, "title"),
    language: getField<string | null>(formData, "language"),
    subtitle: getField<string | null>(formData, "subtitle"),
    description: getField<string | null>(formData, "description"),
    pageCount: getField<number | null>(formData, "pageCount"),
    duration: getField<number | null>(formData, "duration"),
    coverColorsOverride: getField<JsColor[] | null>(
      formData,
      "coverColorsOverride",
    ),
    publicationDate: getField<string | null>(formData, "publicationDate"),
    status: getField<UUID>(formData, "status"),
    userBookRating: getField<UserBookRatingRelation | null>(
      formData,
      "userBookRating",
    ),
    tags: formData
      .getAll("tags")
      .map((entry) => JSON.parse(entry.valueOf() as string) as string),
    creators: formData
      .getAll("creators")
      .map((entry) => JSON.parse(entry.valueOf() as string) as CreatorRelation),
    narrators: formData
      .getAll("narrators")
      .map((entry) => JSON.parse(entry.valueOf() as string) as string),
    authors: formData
      .getAll("authors")
      .map((entry) => JSON.parse(entry.valueOf() as string) as string),
    series: formData
      .getAll("series")
      .map((entry) => JSON.parse(entry.valueOf() as string) as SeriesRelation),
    collections: formData
      .getAll("collections")
      .map((entry) => entry.valueOf() as UUID),
    identifiers: formData
      .getAll("identifiers")
      .map(
        (entry) => JSON.parse(entry.valueOf() as string) as IdentifierRelation,
      ),
    textCover: formData.get("textCover")?.valueOf() as File | undefined,
    audioCover: formData.get("audioCover")?.valueOf() as File | undefined,
  }
}

/**
 * @description Update a book's metadata
 * @pathParams BookIdParamsSchemaV2
 * @body BookUpdateRequestSchemaV2
 * @response BookSchemaV2
 * @contentType multipart/form-data
 * @auth bearer
 * @openapi
 */
export const PUT = withHasPermission<Params>("bookUpdate")(async (
  request,
  context,
) => {
  const { bookId: bookUuid } = await context.params
  const formData = await request.formData()
  const values = parseFormDataFields(formData)

  const parsed = BookUpdateRequestSchemaV2.safeParse({
    ...values,
    userId: request.auth.user.id,
  })

  if (!parsed.success) {
    return NextResponse.json(
      { message: z.treeifyError(parsed.error) },
      { status: 400 },
    )
  }

  const book = await getBook(bookUuid, request.auth.user.id)
  if (!book) {
    return NextResponse.json(
      {
        message: `Could not find book with id ${bookUuid}`,
      },
      { status: 404 },
    )
  }

  const { updates, relations, files } = parsed.data

  const updated = await updateBook(
    bookUuid,
    updates,
    relations,
    request.auth.user.id,
  )

  // the text cover backs both the ebook and the readaloud display
  if (files.textCover) {
    const image = await ingestCoverFile(files.textCover)
    if (image) {
      await attachCover(updated.uuid, textCoverTargets(updated), image, "user")
    }
  }

  if (files.audioCover) {
    const image = await ingestCoverFile(files.audioCover)
    if (image) {
      await attachCover(updated.uuid, audioCoverTargets(updated), image, "user")
    }
  }

  void queueWritesToFiles(book.uuid, files.textCover, files.audioCover)

  if (process.env["NODE_ENV"] === "development") {
    try {
      // BookSchemaV2.parse(updated)
    } catch (e) {
      logger.error({ msg: `Dev only parsing failed`, err: e })
    }
  }

  return NextResponse.json(updated)
})

async function ingestCoverFile(file: File) {
  return await ingestImage(Buffer.from(await file.arrayBuffer()), {
    sourceName: file.name,
  })
}

/**
 * @description Read a book's metadata
 * @pathParams BookIdParamsSchemaV2
 * @response BookSchemaV2
 * @auth bearer
 * @auth basic
 * @openapi
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

  if (process.env["NODE_ENV"] === "development") {
    try {
      BookSchemaV2.parse(book)
    } catch (e) {
      logger.error({ msg: `Dev only parsing failed`, err: e })
    }
  }

  return NextResponse.json(book)
})

/**
 * @description Delete a book
 * @pathParams BookIdParamsSchemaV2
 * @auth bearer
 * @openapi
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
