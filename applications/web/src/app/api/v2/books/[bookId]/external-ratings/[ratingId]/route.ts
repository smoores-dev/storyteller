import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { getBookUuid, touchBook } from "@/database/books"
import { deleteExternalDataForBook } from "@/database/externalSources"
import { type UUID } from "@/uuid"

export const dynamic = "force-dynamic"

type Params = Promise<{ bookId: string; ratingId: UUID }>

export const DELETE = withHasPermission<Params>("bookUpdate")(async (
  request,
  context,
) => {
  const { bookId, ratingId } = await context.params
  const bookUuid = await getBookUuid(bookId)

  if (!(await deleteExternalDataForBook(bookUuid, ratingId))) {
    return NextResponse.json(
      { message: `Could not find rating ${ratingId} on book ${bookId}` },
      { status: 404 },
    )
  }

  return NextResponse.json(await touchBook(bookUuid, request.auth.user.id))
})
