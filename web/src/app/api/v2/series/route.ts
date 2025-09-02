import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { getSeries } from "@/database/series"

/**
 * @summary List all series
 * @desc '
 */
export const GET = withHasPermission("bookList")(async (request) => {
  const series = await getSeries(request.auth.user.id)

  return NextResponse.json(series)
})
