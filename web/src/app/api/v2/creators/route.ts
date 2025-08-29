import { withHasPermission } from "@/auth/auth"
import { Role } from "@/components/books/edit/marcRelators"
import { getCreators } from "@/database/creators"
import { NextResponse } from "next/server"

/**
 * @summary List all creators
 * @desc '
 */
export const GET = withHasPermission("bookList")(async (request) => {
  const role = request.nextUrl.searchParams.get("role") ?? undefined
  const creators = await getCreators(request.auth.user.id, role as Role)

  return NextResponse.json(creators)
})
