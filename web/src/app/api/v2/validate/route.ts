import { withUser } from "@/auth/auth"

export const dynamic = "force-dynamic"

/**
 * @summary Verify that an auth token is still valid
 * @desc '
 */
export const GET = withUser(() => {
  return new Response(null, { status: 204 })
})
