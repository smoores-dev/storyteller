import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { getSeries } from "@/database/series"

/**
 * @summary List all series
 * @desc '
 */
export const GET = withHasPermission("bookList")(async (request) => {
  const { searchParams } = new URL(request.url)
  const order = searchParams.get("order") === "desc" ? "desc" : "asc"
  const limit = searchParams.get("limit")
  const series = await getSeries(request.auth.user.id, {
    order,
    ...(limit && { limit: Number(limit) }),
  })

  return NextResponse.json(series)
})
