import { UserPermissions } from "@/apiModels"
import { withHasPermission } from "@/auth"
import { deleteUser, updateUserPermissions } from "@/database/users"
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

export const PUT = withHasPermission<Params>("user_update")(async (
  request,
  context,
) => {
  const { userUuid } = await context.params
  const { permissions } = (await request.json()) as {
    permissions: UserPermissions
  }
  updateUserPermissions(userUuid, {
    bookCreate: permissions.book_create,
    bookDelete: permissions.book_delete,
    bookDownload: permissions.book_download,
    bookList: permissions.book_list,
    bookProcess: permissions.book_process,
    bookRead: permissions.book_read,
    bookUpdate: permissions.book_update,
    inviteDelete: permissions.invite_delete,
    inviteList: permissions.invite_list,
    settingsUpdate: permissions.settings_update,
    userCreate: permissions.user_create,
    userDelete: permissions.user_delete,
    userList: permissions.user_list,
    userRead: permissions.user_read,
    userUpdate: permissions.user_update,
  })

  return new Response(null, { status: 204 })
})
