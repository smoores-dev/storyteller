import { withHasPermission } from "@/auth/auth"
import { getCreators } from "@/database/creators"
import { NextResponse } from "next/server"

/**
 * @summary List all creators
 * @desc '
 */
export const GET = withHasPermission("bookList")(async () => {
  const creators = await getCreators()

  return NextResponse.json(creators)
})
