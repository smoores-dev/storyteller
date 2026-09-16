import { type NextRequest, NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { getLatestChangelog } from "@/database/changelog"
import { getCurrentVersion } from "@/versions"

export const dynamic = "force-dynamic"

export const GET = withHasPermission("bookList")(async (
  request: NextRequest,
) => {
  const { searchParams } = new URL(request.url)
  const component = searchParams.get("component") ?? "web"

  const changelog = await getLatestChangelog(component, getCurrentVersion())

  return NextResponse.json(changelog)
})
