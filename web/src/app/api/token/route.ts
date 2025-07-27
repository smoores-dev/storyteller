import { createUserToken } from "@/auth/auth"
import { NextRequest } from "next/server"
import { CredentialsSignin } from "next-auth"

export const dynamic = "force-dynamic"

/**
 * @summary deprecated - Create an auth token
 * @desc '
 */
export async function POST(request: NextRequest) {
  const body = await request.formData()
  const username = body.get("username")?.valueOf()
  const password = body.get("password")?.valueOf()
  if (typeof username !== "string" || typeof password !== "string") {
    return new Response(null, { status: 405 })
  }

  try {
    const token = await createUserToken(username, password)
    return Response.json(token)
  } catch (e) {
    if (e instanceof CredentialsSignin) {
      return new Response(null, { status: 401 })
    }
    return new Response(null, { status: 500 })
  }
}
