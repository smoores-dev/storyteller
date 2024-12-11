import { withVerifyToken } from "@/auth"

export const dynamic = "force-dynamic"

export const GET = withVerifyToken(() => {
  return new Response(null, { status: 204 })
})
