import { withHasPermission } from "@/auth/auth"
import { getSeries } from "@/database/series"
import { NextResponse } from "next/server"

/**
 * @summary List all series
 * @desc '
 */
export const GET = withHasPermission("bookList")(async (request) => {
  const series = await getSeries(request.auth.user.id)

  return NextResponse.json(series)
})
