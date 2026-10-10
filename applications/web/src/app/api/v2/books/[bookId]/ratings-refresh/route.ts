import { NextResponse } from "next/server"

import { nodekitErrorResponse } from "@/app/api/v2/metadata/nodekitErrors"
import { withHasPermission } from "@/auth/auth"
import { getBook, getBookUuid } from "@/database/books"
import { refreshExternalRatings } from "@/metadataImport"

export const dynamic = "force-dynamic"

type Params = Promise<{ bookId: string }>

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

  try {
    return NextResponse.json(
      await refreshExternalRatings(book.uuid, request.auth.user.id),
    )
  } catch (error) {
    return nodekitErrorResponse(error)
  }
})
