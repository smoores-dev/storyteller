import { NextResponse } from "next/server"

import { nodekitErrorResponse } from "@/app/api/v2/metadata/nodekitErrors"
import { withHasPermission } from "@/auth/auth"
import { getBook, getBookUuid } from "@/database/books"
import {
  CoverImportError,
  CoverImportRequestSchema,
  applyCoverImport,
} from "@/metadataImport"
import { coverSidesOf } from "@/metadataImportTypes"
import { queueWritesToFiles } from "@/writeToFiles/fileWriteDistributor"

export const dynamic = "force-dynamic"

type Params = Promise<{ bookId: string }>

export const POST = withHasPermission<Params>("bookUpdate")(async (
  request,
  context,
) => {
  const { bookId } = await context.params
  const bookUuid = await getBookUuid(bookId)

  const parsed = CoverImportRequestSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "Invalid cover import request",
        issues: parsed.error.issues,
      },
      { status: 400 },
    )
  }

  const book = await getBook(bookUuid, request.auth.user.id)
  if (!book) {
    return NextResponse.json(
      { message: `Could not find book with id ${bookId}` },
      { status: 404 },
    )
  }

  const sides = parsed.data.covers.map((pick) => pick.side)
  const showable = coverSidesOf(book)
  const unshowable = sides.find((side) => !showable.includes(side))
  if (unshowable) {
    return NextResponse.json(
      { message: `Book has no format that shows a ${unshowable} cover` },
      { status: 400 },
    )
  }

  try {
    const { book: updated, files } = await applyCoverImport(
      book,
      parsed.data,
      request.auth.user.id,
    )
    void queueWritesToFiles(book.uuid, files.text, files.audio)
    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof CoverImportError) {
      return NextResponse.json(
        {
          code: error.code,
          message:
            error.code === "notOffered"
              ? `The provider no longer offers the chosen ${error.side} cover`
              : `The downloaded ${error.side} cover could not be read as an image`,
        },
        { status: error.code === "notOffered" ? 409 : 502 },
      )
    }
    return nodekitErrorResponse(error)
  }
})
