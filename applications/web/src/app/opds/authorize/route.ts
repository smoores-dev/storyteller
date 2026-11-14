import { type NextRequest } from "next/server"

import { nextAuth } from "@/auth/auth"
import { createOPDSToken } from "@/opds/auth"

export const dynamic = "force-dynamic"

const toLogin = (request: NextRequest) =>
  new Response(null, {
    status: 302,
    headers: {
      Location: `/login?callbackUrl=${encodeURIComponent(`/opds/authorize${request.nextUrl.search}`)}`,
      "Cache-Control": "no-store",
    },
  })

export const GET: ReturnType<typeof nextAuth.auth> = await (nextAuth.auth(
  async (request) => {
    if (!request.auth?.user.id) {
      return toLogin(request)
    }

    const token = await createOPDSToken(
      request.auth.user.id,
      request.headers.get("User-Agent"),
    )

    const callback = new URLSearchParams({
      id: "/opds/auth/auth.json",
      access_token: token,
      token_type: "bearer",
    })
    const state = request.nextUrl.searchParams.get("state")
    if (state !== null) {
      callback.set("state", state)
    }

    return new Response(null, {
      status: 302,
      headers: {
        Location: `opds://authorize/?${callback.toString()}`,
        "Cache-Control": "no-store",
      },
    })
  },
) as unknown as Promise<ReturnType<typeof nextAuth.auth>>)
