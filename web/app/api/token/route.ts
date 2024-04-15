import {
  authenticateUser,
  createAccessToken,
  getAccessTokenExpireDate,
} from "@/auth"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  const body = await request.formData()
  const username = body.get("username")?.valueOf()
  const password = body.get("password")?.valueOf()
  if (!(typeof username === "string") || !(typeof password === "string")) {
    return NextResponse.json(
      {
        message: "Missing username or password",
      },
      { status: 405 },
    )
  }
  const user = await authenticateUser(username, password)

  if (!user) {
    return NextResponse.json(
      {
        message: "Incorrect username or password",
      },
      { status: 400 },
    )
  }

  const accessTokenExpires = getAccessTokenExpireDate()

  const accessToken = createAccessToken(
    { sub: user.username },
    accessTokenExpires,
  )

  return NextResponse.json({ access_token: accessToken, token_type: "bearer" })
}
