import { config } from "@/auth/auth"
import { NextRequest } from "next/server"
import { Auth, createActionURL, raw, skipCSRFCheck } from "@auth/core"
import { headers as nextHeaders } from "next/headers"
import { CredentialsSignin } from "next-auth"
import { getCurrentUserSession } from "@/database/users"

export const dynamic = "force-dynamic"

/**
 * @summary Create an auth token
 * @desc '
 */
export async function POST(request: NextRequest) {
  const body = await request.formData()
  const usernameOrEmail = body.get("usernameOrEmail")?.valueOf()

  const headers = new Headers(await nextHeaders())
  const signInURL = createActionURL(
    "callback",
    // @ts-expect-error `x-forwarded-proto` is not nullable, next.js sets it by default
    headers.get("x-forwarded-proto"),
    headers,
    process.env,
    config,
  )
  const url = `${signInURL.toString()}/credentials`
  headers.set("Content-Type", "application/x-www-form-urlencoded")
  const params = new URLSearchParams({
    ...Object.fromEntries(body),
    callbackUrl: "/",
  })
  const req = new Request(url, { method: "POST", headers, body: params })
  try {
    await Auth(req, { ...config, raw, skipCSRFCheck })
    const session = await getCurrentUserSession(usernameOrEmail as string)

    return Response.json({
      access_token: session.sessionToken,
      expires_in: session.expires.valueOf() * 1000 - Date.now(),
      token_type: "bearer",
    })
  } catch (e) {
    if (e instanceof CredentialsSignin) {
      return new Response(null, { status: 405 })
    }
    return new Response(null, { status: 500 })
  }
}
