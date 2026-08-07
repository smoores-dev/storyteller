import { withHasPermission } from "@/auth/auth"
import { updateStatusForBooks } from "@/database/statuses"
import { type UUID } from "@/uuid"

type Params = Promise<{ bookId: UUID }>

export const PUT = withHasPermission<Params>("bookDownload")(async (
  request,
  context,
) => {
  const { bookId } = await context.params
  const body = (await request.json()) as {
    // null clears the reading status
    status: UUID | null
  }

  const { status } = body

  // the same upsert-or-clear path the bulk route takes; updateBook's status
  // relation could only ever update an existing row, never create or drop one.
  await updateStatusForBooks(status ?? null, [bookId], request.auth.user.id)

  return new Response(null, { status: 204 })
})
