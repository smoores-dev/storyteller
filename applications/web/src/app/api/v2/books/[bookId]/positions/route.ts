import { withHasPermission } from "@/auth/auth"
import { getBook, getBookUuid } from "@/database/books"
import {
  type Position,
  PositionConflictError,
  getPosition,
  upsertPosition,
} from "@/database/positions"
import {
  ProgressionConflictError,
  ProgressionNoopError,
  upsertProgression,
} from "@/database/progressions.ts"
import { getStorytellerBaseUrl } from "@/deviceAuthorization.ts"
import { env } from "@/env"
import { logger } from "@/logging.ts"
import { locatorToProgressionDocument } from "@/progress/locators/toProgressionDocument.ts"
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
  const book = await getBook(bookUuid, user.id)
  if (!book) {
    return Response.json(
      { message: `Could not find book with id ${bookUuid}` },
      { status: 404 },
    )
  }

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

  const fallbackOrigin = request.headers.get("Origin") ?? request.nextUrl.origin
  const baseUrl = await getStorytellerBaseUrl(fallbackOrigin)

  try {
    const progressionResult = await locatorToProgressionDocument(
      book,
      body.locator,
      body.timestamp,
      baseUrl,
    )

    // If the upsert succeeds, also update the v3 progression document
    if (progressionResult) {
      try {
        await upsertProgression(user.id, bookUuid, null, progressionResult)
      } catch (e) {
        if (
          e instanceof ProgressionConflictError ||
          e instanceof ProgressionNoopError
        ) {
          // ignore
        } else {
          throw e
        }
      }
    }
  } catch (e) {
    // Ignore
    logger.debug({
      msg: "Failed to upgrade locator to v3 progression document",
      err: e,
    })
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
