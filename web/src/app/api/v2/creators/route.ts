import { withHasPermission } from "@/auth/auth"
import { getCreators } from "@/database/creators"
import { NextResponse } from "next/server"

/**
 * @summary List all creators
 * @desc '
 */
export const GET = withHasPermission("bookList")(async (request) => {
  const creators = await getCreators(request.auth.user.id)

  return NextResponse.json(creators)
})
