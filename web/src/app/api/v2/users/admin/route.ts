import { UserRequest } from "@/apiModels"
import {
  createAccessToken,
  getAccessTokenExpireDate,
  hashPassword,
} from "@/auth"
import { createAdminUser } from "@/database/users"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * @summary Create the admin user
 * @desc Responds with a 403 if the admin user has already been created.
 */
export async function POST(request: NextRequest) {
  const user = (await request.json()) as UserRequest
  const hashedPassword = await hashPassword(user.password)

  try {
    await createAdminUser(
      user.username,
      user.fullName,
      user.email,
      hashedPassword,
    )
  } catch {
    return NextResponse.json(
      { message: "Admin user already exists" },
      { status: 403 },
    )
  }

  const accessTokenExpires = getAccessTokenExpireDate()
  const accessToken = createAccessToken(
    { sub: user.username },
    accessTokenExpires,
  )

  return NextResponse.json({ access_token: accessToken, token_type: "bearer" })
}
