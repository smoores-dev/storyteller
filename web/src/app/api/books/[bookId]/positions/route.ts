import { withHasPermission } from "@/auth/auth"
import { getBookUuid } from "@/database/books"
import {
  getPosition,
  Position,
  PositionConflictError,
  upsertPosition,
} from "@/database/positions"
import { NextResponse } from "next/server"

type Params = Promise<{
  bookId: string
}>

/**
 * @summary deprecated - Update the current position for a book
 * @desc If the timestamp in the provided position is earlier
 *       than the current stored position, this will return a 409
 *       response to indicate that the position was not updated,
 *       and the client should attempt to get the current position
 *       from the server.
 */
export const POST = withHasPermission<Params>("bookRead")(async (
  request,
  context,
) => {
  const body = (await request.json()) as Position
  const { bookId } = await context.params
  const bookUuid = await getBookUuid(bookId)

  const user = request.auth.user
  try {
    await upsertPosition(user.id, bookUuid, body.locator, body.timestamp)
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

/**
 * @summary deprecated - Get the current position for a book
 * @desc '
 */
export const GET = withHasPermission<Params>("bookRead")(async (
  request,
  context,
) => {
  const { bookId } = await context.params
  const bookUuid = await getBookUuid(bookId)
  const user = request.auth.user

  const position = await getPosition(user.id, bookUuid)

  if (!position)
    return NextResponse.json({ message: "No position found" }, { status: 404 })

  return NextResponse.json(position)
})
