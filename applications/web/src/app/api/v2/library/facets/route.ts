import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { getSectionFacets, isFacetSection } from "@/database/libraryCounts"

export const dynamic = "force-dynamic"

export const GET = withHasPermission("bookList")(async (request) => {
  const section = request.nextUrl.searchParams.get("section")

  if (!section || !isFacetSection(section)) {
    return NextResponse.json({ error: "Invalid section" }, { status: 400 })
  }

  const facets = await getSectionFacets(request.auth.user.id, section)

  return NextResponse.json(facets)
})
