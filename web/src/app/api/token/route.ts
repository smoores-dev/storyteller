import { config } from "@/auth/auth"
import { NextRequest } from "next/server"
import { Auth, createActionURL, raw, skipCSRFCheck } from "@auth/core"
import { headers as nextHeaders } from "next/headers"
import { CredentialsSignin } from "next-auth"

export const dynamic = "force-dynamic"

/**
 * @summary deprecated - Create an auth token
 * @desc '
 */
export async function POST(request: NextRequest) {
  const body = await request.formData()

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
    const res = await Auth(req, { ...config, raw, skipCSRFCheck })
    const accessToken = res.cookies?.find(
      ({ name }) => name === "st_token",
    )?.value
    if (!accessToken) return new Response(null, { status: 405 })

    return Response.json({
      access_token: accessToken,
      token_type: "bearer",
    })
  } catch (e) {
    if (e instanceof CredentialsSignin) {
      return new Response(null, { status: 405 })
    }
    return new Response(null, { status: 500 })
  }
}
