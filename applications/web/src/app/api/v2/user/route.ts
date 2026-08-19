import type { User } from "@/apiModels"
import { withUser } from "@/auth/auth"
import { type UserPermissionSet, getUser, updateUser } from "@/database/users"
import { env } from "@/env"

export const dynamic = "force-dynamic"

/**
 * @summary Get the current user details
 * @desc '
 */
export const GET = withUser((request) => {
  const user = request.auth.user

  return Response.json({
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    permissions: {
      bookCreate: user.permissions?.bookCreate ?? false,
      bookDelete: user.permissions?.bookDelete ?? false,
      bookDownload: user.permissions?.bookDownload ?? false,
      bookList: user.permissions?.bookList ?? false,
      bookProcess: user.permissions?.bookProcess ?? false,
      bookRead: user.permissions?.bookRead ?? false,
      bookUpdate: user.permissions?.bookUpdate ?? false,
      collectionCreate: user.permissions?.collectionCreate ?? false,
      inviteDelete: user.permissions?.inviteDelete ?? false,
      inviteList: user.permissions?.inviteList ?? false,
      settingsUpdate: user.permissions?.settingsUpdate ?? false,
      userCreate: user.permissions?.userCreate ?? false,
      userDelete: user.permissions?.userDelete ?? false,
      userList: user.permissions?.userList ?? false,
      userRead: user.permissions?.userRead ?? false,
      userUpdate: user.permissions?.userUpdate ?? false,
      userPasswordReset: user.permissions?.userPasswordReset ?? false,
    } satisfies UserPermissionSet,
  })
})

export const PUT = withUser(async (request) => {
  if (env.STORYTELLER_DEMO_MODE) {
    return new Response(null, { status: 403 })
  }

  const user = request.auth.user

  const update = (await request.json()) as User

  await updateUser(user.id, update)

  const updated = await getUser(user.id)

  if (!updated) return new Response(null, { status: 500 })

  return Response.json({
    id: updated.id,
    name: updated.name,
    username: updated.username,
    email: updated.email,
    permissions: {
      bookCreate: updated.permissions.bookCreate,
      bookDelete: updated.permissions.bookDelete,
      bookDownload: updated.permissions.bookDownload,
      bookList: updated.permissions.bookList,
      bookProcess: updated.permissions.bookProcess,
      bookRead: updated.permissions.bookRead,
      bookUpdate: updated.permissions.bookUpdate,
      collectionCreate: updated.permissions.collectionCreate,
      inviteDelete: updated.permissions.inviteDelete,
      inviteList: updated.permissions.inviteList,
      settingsUpdate: updated.permissions.settingsUpdate,
      userCreate: updated.permissions.userCreate,
      userDelete: updated.permissions.userDelete,
      userList: updated.permissions.userList,
      userRead: updated.permissions.userRead,
      userUpdate: updated.permissions.userUpdate,
      userPasswordReset: updated.permissions.userPasswordReset,
    } satisfies UserPermissionSet,
  })
})
