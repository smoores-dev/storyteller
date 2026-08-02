import { NextResponse } from "next/server"

import { parseGetBooksOptions } from "@/app/api/v2/books/parseBookQuery"
import { withHasPermission } from "@/auth/auth"
import { countBooks } from "@/database/books"

export const dynamic = "force-dynamic"

/**
 * @summary Count books matching a query
 * @desc 'Total number of books matching the same search / filter / membership
 * options as GET /books, ignoring limit + offset. Powers the "showing X of Y"
 * indicator so a paged list can report how many books it is a slice of.'
 */
export const GET = withHasPermission("bookList")(async (request) => {
  const parsed = parseGetBooksOptions(request.nextUrl.searchParams)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  const count = await countBooks(request.auth.user.id, parsed.opts)

  return NextResponse.json({ count })
})
