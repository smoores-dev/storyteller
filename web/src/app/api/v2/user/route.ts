import { User } from "@/apiModels"
import { withUser } from "@/auth/auth"
import { getUser, updateUser, UserPermissionSet } from "@/database/users"

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
    } satisfies UserPermissionSet,
  })
})

export const PUT = withUser(async (request) => {
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
      bookCreate: updated.permissions?.bookCreate ?? false,
      bookDelete: updated.permissions?.bookDelete ?? false,
      bookDownload: updated.permissions?.bookDownload ?? false,
      bookList: updated.permissions?.bookList ?? false,
      bookProcess: updated.permissions?.bookProcess ?? false,
      bookRead: updated.permissions?.bookRead ?? false,
      bookUpdate: updated.permissions?.bookUpdate ?? false,
      collectionCreate: updated.permissions?.collectionCreate ?? false,
      inviteDelete: updated.permissions?.inviteDelete ?? false,
      inviteList: updated.permissions?.inviteList ?? false,
      settingsUpdate: updated.permissions?.settingsUpdate ?? false,
      userCreate: updated.permissions?.userCreate ?? false,
      userDelete: updated.permissions?.userDelete ?? false,
      userList: updated.permissions?.userList ?? false,
      userRead: updated.permissions?.userRead ?? false,
      userUpdate: updated.permissions?.userUpdate ?? false,
    } satisfies UserPermissionSet,
  })
})
