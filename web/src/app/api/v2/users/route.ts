import { InviteAccept } from "@/apiModels"
import {
  createAccessToken,
  getAccessTokenExpireDate,
  hashPassword,
  withHasPermission,
} from "@/auth"
import { verifyInvite } from "@/database/invites"
import { createUser, getUsers, UserPermissionSet } from "@/database/users"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * @summary List all users
 * @desc '
 */
export const GET = withHasPermission("userList")(async () => {
  const users = await getUsers()
  return NextResponse.json(
    users.map((user) => ({
      uuid: user.uuid,
      fullName: user.fullName,
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
    })),
  )
})

/**
 * @summary Create a user from an invite
 * @desc Invite keys can only be used once, and the user's email
 *       must match the email used to create the invite.
 */
export async function POST(request: NextRequest) {
  const invite = (await request.json()) as InviteAccept
  const verified = await verifyInvite(invite.email, invite.inviteKey)
  if (!verified) {
    return NextResponse.json(
      {
        message: "Invalid authentication credentials",
      },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
    )
  }

  const hashedPassword = await hashPassword(invite.password)

  await createUser(
    invite.username,
    invite.fullName,
    invite.email,
    hashedPassword,
    invite.inviteKey,
  )

  const accessTokenExpires = getAccessTokenExpireDate()
  const accessToken = createAccessToken(
    { sub: invite.username },
    accessTokenExpires,
  )

  return NextResponse.json({ access_token: accessToken, token_type: "bearer" })
}
