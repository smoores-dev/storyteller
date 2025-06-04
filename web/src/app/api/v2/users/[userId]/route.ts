import { withHasPermission } from "@/auth/auth"
import {
  deleteUser,
  updateUserPermissions,
  UserPermissionSet,
} from "@/database/users"
import { UUID } from "@/uuid"

export const dynamic = "force-dynamic"

type Params = Promise<{
  userId: UUID
}>

/**
 * @summary Delete a user
 * @desc '
 */
export const DELETE = withHasPermission<Params>("userDelete")(async (
  _request,
  context,
) => {
  const { userId } = await context.params
  await deleteUser(userId)

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
  const { userId } = await context.params
  const { permissions } = (await request.json()) as {
    permissions: UserPermissionSet
  }
  await updateUserPermissions(userId, permissions)

  return new Response(null, { status: 204 })
})
