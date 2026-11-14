import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { getUserRatings } from "@/database/userRatings"

/**
 * @summary List all of the current user's book ratings
 */
export const GET = withHasPermission("manageSelf")(async (request) => {
  const ratings = await getUserRatings(request.auth.user.id)
  return NextResponse.json(ratings)
})
