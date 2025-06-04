import { withHasPermission } from "@/auth/auth"
import { getAuthors } from "@/database/authors"
import { NextResponse } from "next/server"

/**
 * @summary List all authors
 * @desc '
 */
export const GET = withHasPermission("bookList")(async () => {
  const authors = await getAuthors()

  return NextResponse.json(authors)
})
