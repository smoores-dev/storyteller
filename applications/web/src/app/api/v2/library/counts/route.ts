import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { getLibraryCounts } from "@/database/libraryCounts"

export const dynamic = "force-dynamic"

/**
 * @summary Library facet counts
 * @desc 'Book counts per library facet (series, creators, tags, statuses,
 * publication years, ratings) plus per-collection and per-shelf book counts
 */
export const GET = withHasPermission("bookList")(async (request) => {
  const counts = await getLibraryCounts(request.auth.user.id)

  return NextResponse.json(counts)
})
