import { type NextRequest, NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { getChangelog } from "@/database/changelog"

export const dynamic = "force-dynamic"

export const GET = withHasPermission("bookList")(async (
  request: NextRequest,
) => {
  const { searchParams } = new URL(request.url)

  const component = searchParams.get("component") ?? "web"
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"))
  const perPage = Math.min(
    100,
    Math.max(1, Number(searchParams.get("perPage") ?? "20")),
  )

  const entries = await getChangelog(component, { page, perPage })

  return NextResponse.json(entries)
})
