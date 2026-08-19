import { type NextRequest, NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { getLatestChangelog } from "@/database/changelog"

export const dynamic = "force-dynamic"

export const GET = withHasPermission("bookList")(async (
  request: NextRequest,
) => {
  const { searchParams } = new URL(request.url)
  const component = searchParams.get("component") ?? "web"
  const beta = searchParams.get("beta") === "true"

  const changelog = await getLatestChangelog(component, { beta })

  return NextResponse.json(changelog)
})
