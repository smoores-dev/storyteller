import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { getCreators } from "@/database/creators"
import { type Role } from "@/metadata/marcRelators"

/**
 * @summary List all creators
 * @desc '
 */
export const GET = withHasPermission("bookList")(async (request) => {
  const role = request.nextUrl.searchParams.get("role") ?? undefined
  const creators = await getCreators(request.auth.user.id, role as Role)

  return NextResponse.json(creators)
})
