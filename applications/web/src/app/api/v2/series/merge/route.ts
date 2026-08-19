import { withHasPermission } from "@/auth/auth"
import { mergeSeries } from "@/database/series"
import { type UUID } from "@/uuid"

export const POST = withHasPermission("bookUpdate")(async (request) => {
  const { targetUuid, sourceUuids } = (await request.json()) as {
    targetUuid: UUID
    sourceUuids: UUID[]
  }

  await mergeSeries(targetUuid, sourceUuids)
  return new Response(null, { status: 204 })
})
