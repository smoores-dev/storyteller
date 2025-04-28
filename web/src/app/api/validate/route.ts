import { withVerifyToken } from "@/auth"

export const dynamic = "force-dynamic"

/**
 * @summary deprecated - Verify that an auth token is still valid
 * @desc '
 */
export const GET = withVerifyToken(() => {
  return new Response(null, { status: 204 })
})
