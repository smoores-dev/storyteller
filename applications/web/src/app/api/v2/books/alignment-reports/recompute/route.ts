import { withHasPermission } from "@/auth/auth"
import { recomputeAlignmentSummaries } from "@/database/alignmentReports"
import { type UUID } from "@/uuid"

export const dynamic = "force-dynamic"

/**
 * @summary Recompute alignment report summaries
 *
 * @desc Re-derives the grade, score and coverage columns from the stored
 *       report JSON and overrides. Pass `bookUuids` to limit to specific
 *       books, or omit it to recompute every report in the library.
 */
export const POST = withHasPermission("bookProcess")(async (request) => {
  let body: unknown = null
  try {
    body = await request.json()
  } catch {
    body = null
  }

  const rawUuids =
    body && typeof body === "object" && "bookUuids" in body
      ? (body as { bookUuids?: unknown }).bookUuids
      : undefined

  const bookUuids =
    Array.isArray(rawUuids) && rawUuids.every((u) => typeof u === "string")
      ? (rawUuids as UUID[])
      : null

  const count = await recomputeAlignmentSummaries(bookUuids)

  return Response.json({ count })
})
