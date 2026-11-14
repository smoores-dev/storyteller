import { withHasPermission } from "@/auth/auth"
import { deleteApiToken } from "@/database/apiTokens"
import { type UUID } from "@/uuid"

export const dynamic = "force-dynamic"

type Params = Promise<{
  uuid: UUID
}>

/**
 * @summary Revoke one of the current user's API tokens
 */
export const DELETE = withHasPermission<Params>("manageSelf", {
  sessionOnly: true,
})(async (request, context) => {
  const { uuid } = await context.params
  const deleted = await deleteApiToken(request.auth.user.id, uuid)

  return new Response(null, { status: deleted ? 204 : 404 })
})
