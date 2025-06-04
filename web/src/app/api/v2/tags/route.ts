import { withHasPermission } from "@/auth/auth"
import { getTags } from "@/database/tags"
import { NextResponse } from "next/server"

/**
 * @summary List all tags
 * @desc '
 */
export const GET = withHasPermission("bookList")(async () => {
  const tags = await getTags()

  return NextResponse.json(tags)
})
