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

export const GET = withHasPermission("user_list")(async () => {
  const users = await getUsers()
  return NextResponse.json(users)
})

type InviteAccept = {
  username: string
  full_name: string
  email: string
  password: string
  invite_key: string
}

export async function POST(request: NextRequest) {
  const invite: InviteAccept = await request.json()
  const verified = await verifyInvite(invite.email, invite.invite_key)
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
