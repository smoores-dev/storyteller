import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { getStatuses } from "@/database/statuses"

/**
 * @summary List all book statuses
 * @desc '
 */
export const GET = withHasPermission("bookList")(async () => {
  const statuses = await getStatuses()

  return NextResponse.json(statuses)
})
