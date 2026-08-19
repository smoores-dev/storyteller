import { withHasPermission } from "@/auth/auth"
import { mergeTags } from "@/database/tags"
import { type UUID } from "@/uuid"

export const POST = withHasPermission("bookUpdate")(async (request) => {
  const { targetUuid, sourceUuids } = (await request.json()) as {
    targetUuid: UUID
    sourceUuids: UUID[]
  }

  await mergeTags(targetUuid, sourceUuids)
  return new Response(null, { status: 204 })
})
