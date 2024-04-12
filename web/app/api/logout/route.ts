import { withVerifyToken } from "@/auth"
import { revokeToken } from "@/database/tokenRevokations"

export const dynamic = "force-dynamic"

export const POST = withVerifyToken(async (_request, _context, token) => {
  await revokeToken(token)

  return new Response(null, { status: 204 })
})
