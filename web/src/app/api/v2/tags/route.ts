import { withHasPermission } from "@/auth/auth"
import { getTags } from "@/database/tags"
import { NextResponse } from "next/server"

/**
 * @summary List all tags
 * @desc '
 */
export const GET = withHasPermission("bookList")(async (request) => {
  const tags = await getTags(request.auth.user.id)

  return NextResponse.json(tags)
})
