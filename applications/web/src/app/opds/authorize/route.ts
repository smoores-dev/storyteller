import { type NextRequest } from "next/server"

import { createSessionTokenForUserId, nextAuth } from "@/auth/auth"

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

    const token = await createSessionTokenForUserId(request.auth.user.id)

    const callback = new URLSearchParams({
      id: "/opds/auth/auth.json",
      access_token: token.access_token,
      token_type: token.token_type,
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
