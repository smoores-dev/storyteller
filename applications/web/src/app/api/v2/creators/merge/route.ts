import { withHasPermission } from "@/auth/auth"
import { mergeCreators } from "@/database/creators"
import { type UUID } from "@/uuid"

export const POST = withHasPermission("bookUpdate")(async (request) => {
  const { targetUuid, sourceUuids } = (await request.json()) as {
    targetUuid: UUID
    sourceUuids: UUID[]
  }

  await mergeCreators(targetUuid, sourceUuids)
  return new Response(null, { status: 204 })
})
