import { withHasPermission } from "@/auth"
import { getBookUuid } from "@/database/books"
import {
  getPosition,
  Position,
  PositionConflictError,
  upsertPosition,
} from "@/database/positions"
import { getUser } from "@/database/users"
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
  _token,
  tokenData,
) => {
  const body = (await request.json()) as Position
  const username = tokenData.username
  const { bookId } = await context.params
  const bookUuid = await getBookUuid(bookId)

  const user = await getUser(username)
  if (!user) throw new Error("Couldn't find authenticated user in database")
  try {
    await upsertPosition(user.uuid, bookUuid, body.locator, body.timestamp)
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
  _request,
  context,
  _token,
  tokenData,
) => {
  const username = tokenData.username
  const { bookId } = await context.params
  const bookUuid = await getBookUuid(bookId)
  const user = await getUser(username)
  if (!user) throw new Error("Couldn't find authenticated user in database")

  const position = await getPosition(user.uuid, bookUuid)

  if (!position)
    return NextResponse.json({ message: "No position found" }, { status: 404 })

  return NextResponse.json(position)
})
