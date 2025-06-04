import { withHasPermission } from "@/auth/auth"
import { getSeries } from "@/database/series"
import { NextResponse } from "next/server"

/**
 * @summary List all series
 * @desc '
 */
export const GET = withHasPermission("bookList")(async () => {
  const series = await getSeries()

  return NextResponse.json(series)
})
