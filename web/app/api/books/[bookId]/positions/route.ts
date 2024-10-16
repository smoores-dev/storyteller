import { withHasPermission } from "@/auth"
import { getBookUuid } from "@/database/books"
import {
  getPosition,
  PositionConflictError,
  upsertPosition,
} from "@/database/positions"
import { getUser } from "@/database/users"
import { NextResponse } from "next/server"

type PositionBody = {
  locator: unknown
  timestamp: number
}

type Params = {
  bookId: string
}

export const POST = withHasPermission<Params>("book_read")(async (
  request,
  context,
  _token,
  tokenData,
) => {
  const body = (await request.json()) as PositionBody
  const username = tokenData.username
  const bookUuid = getBookUuid(context.params.bookId)

  const user = getUser(username)
  if (!user) throw new Error("Couldn't find authenticated user in database")
  try {
    upsertPosition(user.uuid, bookUuid, body.locator, body.timestamp)
  } catch (e) {
    if (e instanceof PositionConflictError) {
      return NextResponse.json(
        { message: "Position already exists with a later timestamp" },
        { status: 409 },
      )
    }
    throw e
  }

  return new Response(null, { status: 204 })
})

export const GET = withHasPermission<Params>("book_read")((
  _request,
  context,
  _token,
  tokenData,
) => {
  const username = tokenData.username
  const bookUuid = getBookUuid(context.params.bookId)
  const user = getUser(username)
  if (!user) throw new Error("Couldn't find authenticated user in database")

  const position = getPosition(user.uuid, bookUuid)

  if (!position)
    return NextResponse.json({ message: "No position found" }, { status: 404 })

  return NextResponse.json(position)
})
