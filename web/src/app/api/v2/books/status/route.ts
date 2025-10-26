import { withHasPermission } from "@/auth/auth"
import { updateStatusForBooks } from "@/database/statuses"
import { type UUID } from "@/uuid"

export const PUT = withHasPermission("bookDownload")(async (request) => {
  const body = (await request.json()) as {
    books: UUID[]
    status: UUID
  }

  const { books, status } = body

  await updateStatusForBooks(status, books, request.auth.user.id)

  return new Response(null, { status: 204 })
})
