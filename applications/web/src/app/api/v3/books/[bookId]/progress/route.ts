import { flattenError, z } from "zod"

import { withHasPermission } from "@/auth/auth.ts"
import { getBook } from "@/database/books.ts"
import {
  getPosition,
  PositionConflictError,
  upsertPosition,
} from "@/database/positions.ts"
import {
  getProgressionDocument,
  ProgressionConflictError,
  ProgressionNoopError,
  upsertProgression,
} from "@/database/progressions.ts"
import { getStorytellerBaseUrl } from "@/deviceAuthorization.ts"
import { env } from "@/env.ts"
import { logger } from "@/logging.ts"
import { mapValues } from "@/objects.ts"
import { locatorFromReferences } from "@/progress/locators/fromReferences.ts"
import { locatorToProgressionDocument } from "@/progress/locators/toProgressionDocument.ts"
import { resolveReferences } from "@/progress/references.ts"
import { uuidv4 } from "@/schemas/uuid.ts"
import {
  type ProgressionDocument,
  ProgressionDocumentSchema,
} from "@/schemas/v3/progress.ts"

type Params = Promise<{
  bookId: string
}>

export const POST = withHasPermission<Params>("bookRead")(async (
  request,
  context,
) => {
  if (env.STORYTELLER_DEMO_MODE) {
    return new Response(null, { status: 403 })
  }

  const bookUuidResult = z.safeParse(uuidv4, (await context.params).bookId)
  if (!bookUuidResult.success) {
    return Response.json(flattenError(bookUuidResult.error), { status: 400 })
  }

  const formatResult = z.safeParse(
    z.enum(["ebook", "audiobook", "readaloud"]),
    request.nextUrl.searchParams.get("format"),
  )
  if (!formatResult.success) {
    return Response.json(flattenError(formatResult.error), { status: 400 })
  }

  const format = formatResult.data
  const bookUuid = bookUuidResult.data
  const userId = request.auth.user.id
  const book = await getBook(bookUuid, userId)
  if (!book) {
    return Response.json(
      { message: `Could not find book with id ${bookUuid}` },
      { status: 404 },
    )
  }
  const body: unknown = await request.json()
  const progressionDocumentResult = z.safeParse(ProgressionDocumentSchema, body)
  if (!progressionDocumentResult.success) {
    return Response.json(flattenError(progressionDocumentResult.error), {
      status: 400,
    })
  }

  const progressionDocument = progressionDocumentResult.data

  const references = await resolveReferences(
    book,
    format,
    progressionDocument.references,
  )

  const { references: _, ...progression } = progressionDocument

  const progressionDocuments = mapValues(references, (refs) => ({
    ...progression,
    references: refs,
  }))

  const result = progressionDocuments[format]

  try {
    await upsertProgression(userId, bookUuid, progressionDocuments)
  } catch (e) {
    if (e instanceof ProgressionConflictError) {
      return Response.json({ message: e.message }, { status: 409 })
    }
    if (e instanceof ProgressionNoopError) {
      return Response.json(result, { status: 200 })
    }

    throw e
  }

  try {
    const locator = await locatorFromReferences(book, references)

    // If the v3 progression write succeeds without conflict, also write
    // the equivalent v2 position
    if (locator) {
      try {
        await upsertPosition(
          userId,
          bookUuid,
          locator,
          new Date(progressionDocument.modified).valueOf(),
        )
      } catch (e) {
        if (e instanceof PositionConflictError) {
          // ignore
        } else {
          throw e
        }
      }
    }
  } catch (e) {
    // Ignore
    logger.debug({
      msg: "Failed to downgrade progression document to v2 locator",
      err: e,
    })
  }

  return Response.json(
    {
      ...result,
      references: result.references.map((ref) => ref.href),
    } satisfies ProgressionDocument,
    { status: 201 },
  )
})

export const GET = withHasPermission<Params>("bookRead")(async (
  request,
  context,
) => {
  if (env.STORYTELLER_DEMO_MODE) {
    return new Response(null, { status: 403 })
  }

  const bookUuidResult = z.safeParse(uuidv4, (await context.params).bookId)
  if (!bookUuidResult.success) {
    return Response.json(flattenError(bookUuidResult.error), { status: 400 })
  }

  const formatResult = z.safeParse(
    z.enum(["ebook", "audiobook", "readaloud"]),
    request.nextUrl.searchParams.get("format"),
  )
  if (!formatResult.success) {
    return Response.json(flattenError(formatResult.error), { status: 400 })
  }

  const format = formatResult.data
  const bookUuid = bookUuidResult.data
  const userId = request.auth.user.id

  let progressionDocument = await getProgressionDocument(
    userId,
    bookUuid,
    format,
  )
  if (!progressionDocument) {
    // If there's no v3 progression, check if we have a v2 progression.
    // If we do, convert it on the fly
    const position = await getPosition(userId, bookUuid)

    if (!position) {
      // Not an error, just means start at the beginning
      return Response.json({ message: "No progression found" }, { status: 404 })
    }

    const book = await getBook(bookUuid, userId)
    if (!book) {
      return Response.json(
        { message: `Could not find book with id ${bookUuid}` },
        { status: 400 },
      )
    }
    const fallbackOrigin =
      request.headers.get("Origin") ?? request.nextUrl.origin
    let progressionResult!: Awaited<
      ReturnType<typeof locatorToProgressionDocument>
    >
    try {
      const baseUrl = await getStorytellerBaseUrl(fallbackOrigin)
      progressionResult = await locatorToProgressionDocument(
        book,
        position.locator,
        position.timestamp,
        baseUrl,
      )
      if (!progressionResult) {
        return Response.json(
          { message: "No progression found" },
          { status: 404 },
        )
      }
    } catch {
      // If we throw while attempting to upgrade the
      // v2 position, just return not found as if there
      // waa no v2 position
      return Response.json({ message: "No progression found" }, { status: 404 })
    }
    try {
      await upsertProgression(userId, bookUuid, progressionResult)
    } catch (e) {
      // ignore
      logger.debug({ msg: `Failed to save newly migrated v3`, err: e })
    }

    progressionDocument = progressionResult[format] && {
      ...progressionResult[format],
      references: progressionResult[format].references.map((ref) => ref.href),
    }
  }

  return Response.json(progressionDocument)
})
