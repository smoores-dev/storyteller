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
    status: UUID | null
  }

  const { status } = body

  await updateStatusForBooks(status ?? null, [bookId], request.auth.user.id)

  return new Response(null, { status: 204 })
})
