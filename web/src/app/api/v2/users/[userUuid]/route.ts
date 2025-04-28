import { withHasPermission } from "@/auth"
import {
  deleteUser,
  updateUserPermissions,
  UserPermissionSet,
} from "@/database/users"
import { UUID } from "@/uuid"

export const dynamic = "force-dynamic"

type Params = Promise<{
  userUuid: UUID
}>

/**
 * @summary Delete a user
 * @desc '
 */
export const DELETE = withHasPermission<Params>("userDelete")(async (
  _request,
  context,
) => {
  const { userUuid } = await context.params
  await deleteUser(userUuid)

  return new Response(null, { status: 204 })
})

/**
 * @summary Update a user's permissions
 * @desc '
 */
export const PUT = withHasPermission<Params>("userUpdate")(async (
  request,
  context,
) => {
  const { userUuid } = await context.params
  const { permissions } = (await request.json()) as {
    permissions: UserPermissionSet
  }
  await updateUserPermissions(userUuid, permissions)

  return new Response(null, { status: 204 })
})
