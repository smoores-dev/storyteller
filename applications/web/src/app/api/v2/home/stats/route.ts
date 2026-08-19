import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { getHomeStats } from "@/database/homeStats"

export const dynamic = "force-dynamic"

export const GET = withHasPermission("bookList")(async (request) => {
  const user = request.auth.user
  const stats = await getHomeStats(user.id)

  return NextResponse.json(stats)
})
