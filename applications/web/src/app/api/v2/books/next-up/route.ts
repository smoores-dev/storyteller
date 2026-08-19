import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { getNextUpInSeries } from "@/database/nextUp"

export const dynamic = "force-dynamic"

/**
 * @summary The next to-be-read book of each series the user has read into
 */
export const GET = withHasPermission("bookList")(async (request) => {
  const books = await getNextUpInSeries(request.auth.user.id)
  return NextResponse.json(books)
})
