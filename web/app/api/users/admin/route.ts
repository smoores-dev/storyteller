import {
  createAccessToken,
  getAccessTokenExpireDate,
  hashPassword,
} from "@/auth"
import { createAdminUser } from "@/database/users"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

type UserRequest = {
  username: string
  password: string
  full_name: string
  email: string
}

export async function POST(request: NextRequest) {
  const user = (await request.json()) as UserRequest
  const hashedPassword = await hashPassword(user.password)

  await createAdminUser(
    user.username,
    user.full_name,
    user.email,
    hashedPassword,
  )

  const accessTokenExpires = getAccessTokenExpireDate()
  const accessToken = createAccessToken(
    { sub: user.username },
    accessTokenExpires,
  )

  return NextResponse.json({ access_token: accessToken, token_type: "bearer" })
}
