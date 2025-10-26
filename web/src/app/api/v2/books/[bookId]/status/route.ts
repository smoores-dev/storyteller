import { withHasPermission } from "@/auth/auth"
import { updateBook } from "@/database/books"
import { type UUID } from "@/uuid"

type Params = Promise<{ bookId: UUID }>

export const PUT = withHasPermission<Params>("bookDownload")(async (
  request,
  context,
) => {
  const { bookId } = await context.params
  const body = (await request.json()) as {
    status: UUID
  }

  const { status } = body

  await updateBook(bookId, null, {
    status: { statusUuid: status, userId: request.auth.user.id },
  })

  return new Response(null, { status: 204 })
})
