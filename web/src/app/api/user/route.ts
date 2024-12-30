import { UserPermissions } from "@/apiModels"
import { withVerifyToken } from "@/auth"
import { getUser } from "@/database/users"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export const GET = withVerifyToken((_request, _context, _token, tokenData) => {
  const user = getUser(tokenData.username)

  if (!user) {
    return NextResponse.json(
      {
        message: "Invalid authentication credentials",
      },
      {
        status: 401,
        headers: { "WWW-Authenticate": "Bearer" },
      },
    )
  }

  return NextResponse.json({
    uuid: user.uuid,
    full_name: user.fullName,
    username: user.username,
    email: user.email,
    permissions: {
      book_create: user.permissions.bookCreate,
      book_delete: user.permissions.bookDelete,
      book_download: user.permissions.bookDownload,
      book_list: user.permissions.bookList,
      book_process: user.permissions.bookProcess,
      book_read: user.permissions.bookRead,
      book_update: user.permissions.bookUpdate,
      invite_delete: user.permissions.inviteDelete,
      invite_list: user.permissions.inviteList,
      settings_update: user.permissions.settingsUpdate,
      user_create: user.permissions.userCreate,
      user_delete: user.permissions.userDelete,
      user_list: user.permissions.userList,
      user_read: user.permissions.userRead,
      user_update: user.permissions.userUpdate,
    } satisfies UserPermissions,
  })
})
