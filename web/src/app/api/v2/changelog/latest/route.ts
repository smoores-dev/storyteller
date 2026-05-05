import { type NextRequest, NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { getLatestVersion } from "@/database/changelog"

export const dynamic = "force-dynamic"

export const GET = withHasPermission("bookList")(async (
  request: NextRequest,
) => {
  const { searchParams } = new URL(request.url)
  const component = searchParams.get("component") ?? "web"
  const beta = searchParams.get("beta") === "true"

  const version = await getLatestVersion(component, { beta })

  return NextResponse.json({ version })
})
