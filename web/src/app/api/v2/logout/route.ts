import { type NextRequest } from "next/server"

import { nextAuth } from "@/auth/auth"

export const dynamic = "force-dynamic"

/**
 * @summary Log out
 * @desc '
 */
export const POST = async (request: NextRequest) => {
  const redirectTo = request.nextUrl.searchParams.get("redirectTo")

  await nextAuth.signOut({ redirectTo: redirectTo ?? "/login" })
}
