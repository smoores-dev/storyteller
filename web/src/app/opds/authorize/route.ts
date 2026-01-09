import { nextAuth } from "@/auth/auth"

export const dynamic = "force-dynamic"

export const GET: ReturnType<typeof nextAuth.auth> = await (nextAuth.auth(
  (request) => {
    if (!request.auth) {
      return new Response(null, {
        status: 301,
        headers: {
          Location: `/login?callbackUrl=${encodeURIComponent("/opds/authorize")}`,
        },
      })
    }

    const authToken = request.cookies.get("st_token")?.value
    if (!authToken) {
      return new Response(null, {
        status: 301,
        headers: {
          Location: `/login?callbackUrl=${encodeURIComponent("/opds/authorize")}`,
        },
      })
    }

    const authDocumentId = `/opds/auth/auth.json`
    const callbackUrl = `opds://authorize/?id=${encodeURIComponent(authDocumentId)}&access_token=${encodeURIComponent(authToken)}&token_type=bearer`

    return new Response(null, {
      status: 302,
      headers: { Location: callbackUrl },
    })
  },
) as unknown as Promise<ReturnType<typeof nextAuth.auth>>)
