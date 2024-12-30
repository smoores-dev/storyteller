import { UserPermissions } from "@/apiModels"
import {
  createAccessToken,
  getAccessTokenExpireDate,
  hashPassword,
  withHasPermission,
} from "@/auth"
import { verifyInvite } from "@/database/invites"
import { createUser, getUsers } from "@/database/users"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export const GET = withHasPermission("user_list")(() => {
  const users = getUsers()
  return NextResponse.json(
    users.map((user) => ({
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
    })),
  )
})

type InviteAccept = {
  username: string
  full_name: string
  email: string
  password: string
  invite_key: string
}

export async function POST(request: NextRequest) {
  const invite = (await request.json()) as InviteAccept
  const verified = verifyInvite(invite.email, invite.invite_key)
  if (!verified) {
    return NextResponse.json(
      {
        message: "Invalid authentication credentials",
      },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
    )
  }

  const hashedPassword = await hashPassword(invite.password)

  createUser(
    invite.username,
    invite.full_name,
    invite.email,
    hashedPassword,
    invite.invite_key,
  )

  const accessTokenExpires = getAccessTokenExpireDate()
  const accessToken = createAccessToken(
    { sub: invite.username },
    accessTokenExpires,
  )

  return NextResponse.json({ access_token: accessToken, token_type: "bearer" })
}
