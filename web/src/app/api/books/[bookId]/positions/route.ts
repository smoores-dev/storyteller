import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { getBookUuid } from "@/database/books"
import {
  type Position,
  PositionConflictError,
  fromLegacyLocator,
  getPosition,
  toLegacyLocator,
  upsertPosition,
} from "@/database/positions"
import { env } from "@/env"
import { logger } from "@/logging"
import type { UUID } from "@/uuid"

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
  if (env.STORYTELLER_DEMO_MODE) {
    return new Response(null, { status: 403 })
  }
  const body = (await request.json()) as Position
  const { bookId } = await context.params
  logger.debug(`/api/books/${bookId}/positions`)
  let bookUuid: UUID
  try {
    bookUuid = await getBookUuid(bookId)
    logger.debug(`Got book UUID: ${bookUuid}`)
  } catch {
    logger.debug(`No book with id ${bookId}, returning 404`)
    return Response.json({ message: "Book not found" }, { status: 404 })
  }

  const user = request.auth.user
  try {
    // Maintain the legacy "overwrite on equal" behavior. Always overwrite the
    // position, even if writing a different locator with the same timestamp.
    // transform legacy locator to new format (without `/` prefix, encoded special characters)
    const transformedLocator = fromLegacyLocator(body.locator)
    await upsertPosition(
      user.id,
      bookUuid,
      transformedLocator,
      body.timestamp,
      true,
    )
  } catch (e) {
    if (e instanceof PositionConflictError) {
      logger.debug(`Encountered conflict error, returning 409`)
      return NextResponse.json(
        { message: "Position already exists with a later timestamp" },
        { status: 409 },
      )
    }
    logger.debug(`Failed to update position for book ${bookUuid}`)
    logger.debug(e)
    throw e
  }

  logger.debug("Position updated successfully, returning 204")
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

  const locator = toLegacyLocator(position.locator)

  return NextResponse.json({
    ...position,
    locator,
  })
})
