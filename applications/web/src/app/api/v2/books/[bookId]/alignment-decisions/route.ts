import { withHasPermission } from "@/auth/auth"
import { getAlignmentDecisions } from "@/database/alignmentDecisions"
import { updateAlignmentDecisions } from "@/database/alignmentReports"
import { getBook } from "@/database/books"
import { AlignmentDecisionsSchemaV2 } from "@/schemas/v2/alignmentReport"
import type { UUID } from "@/uuid"

export const dynamic = "force-dynamic"

type Params = Promise<{ bookId: string }>

/**
 * @description Get the alignment decisions for a book. Decisions outlive alignment runs: excluded chapters are skipped by the next alignment, included chapters are aligned even when a rule would skip them, and excluded audio is masked.
 * @pathParams BookIdParamsSchemaV2
 * @response AlignmentDecisionsSchemaV2
 * @auth bearer
 * @openapi
 */
export const GET = withHasPermission<Params>("bookProcess")(async (
  request,
  context,
) => {
  const { bookId } = await context.params
  const bookUuid = bookId as UUID
  const book = await getBook(bookUuid, request.auth.user.id)
  if (!book) {
    return Response.json(
      { message: `Book ${bookId} not found` },
      { status: 404 },
    )
  }
  return Response.json(await getAlignmentDecisions(bookUuid))
})

/**
 * @description Replace the alignment decisions for a book and regrade its latest report. The new decisions apply to the next alignment run.
 * @pathParams BookIdParamsSchemaV2
 * @request AlignmentDecisionsSchemaV2
 * @response AlignmentDecisionsSchemaV2
 * @auth bearer
 * @openapi
 */
export const PUT = withHasPermission<Params>("bookProcess")(async (
  request,
  context,
) => {
  const { bookId } = await context.params
  const bookUuid = bookId as UUID
  const book = await getBook(bookUuid, request.auth.user.id)
  if (!book) {
    return Response.json(
      { message: `Book ${bookId} not found` },
      { status: 404 },
    )
  }

  const parsed = AlignmentDecisionsSchemaV2.safeParse(await request.json())
  if (!parsed.success) {
    return Response.json(
      { message: "Invalid alignment decisions", issues: parsed.error.issues },
      { status: 400 },
    )
  }

  return Response.json(await updateAlignmentDecisions(bookUuid, parsed.data))
})
