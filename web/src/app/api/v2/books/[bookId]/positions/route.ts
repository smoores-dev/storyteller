import { withHasPermission } from "@/auth/auth"
import { getBookUuid } from "@/database/books"
import {
  type Position,
  PositionConflictError,
  getPosition,
  upsertPosition,
} from "@/database/positions"
import { env } from "@/env"
import type { UUID } from "@/uuid"

type Params = Promise<{
  bookId: string
}>

/**
 * @summary Update the current position for a book
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
  if (env.STORYTELLER_DEMO_MODE) {
    return new Response(null, { status: 403 })
  }
  const body = (await request.json()) as Position
  const { bookId } = await context.params
  let bookUuid: UUID
  try {
    bookUuid = await getBookUuid(bookId)
  } catch {
    return Response.json({ message: "Book not found" }, { status: 404 })
  }
  const user = request.auth.user

  try {
    await upsertPosition(user.id, bookUuid, body.locator, body.timestamp)
  } catch (e) {
    if (e instanceof PositionConflictError) {
      return Response.json(
        { message: "Position already exists with a later timestamp" },
        { status: 409 },
      )
    }
    throw e
  }

  return new Response(null, { status: 204 })
})

/**
 * @summary Get the current position for a book
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
    return Response.json({ message: "No position found" }, { status: 404 })

  return Response.json(position)
})
