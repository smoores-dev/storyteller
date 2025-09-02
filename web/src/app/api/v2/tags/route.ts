import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { getTags } from "@/database/tags"

/**
 * @summary List all tags
 * @desc '
 */
export const GET = withHasPermission("bookList")(async (request) => {
  const tags = await getTags(request.auth.user.id)

  return NextResponse.json(tags)
})
