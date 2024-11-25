import { withHasPermission } from "@/auth"
import { deleteUser } from "@/database/users"
import { UUID } from "@/uuid"

export const dynamic = "force-dynamic"

type Params = Promise<{
  userUuid: UUID
}>

export const DELETE = withHasPermission<Params>("user_delete")(async (
  _request,
  context,
) => {
  const { userUuid } = await context.params
  deleteUser(userUuid)

  return new Response(null, { status: 204 })
})
