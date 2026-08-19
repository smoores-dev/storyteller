import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { createStatus, getStatuses } from "@/database/statuses"

/**
 * @summary List all book statuses
 * @desc '
 */
export const GET = withHasPermission("bookList")(async () => {
  const statuses = await getStatuses()

  return NextResponse.json(statuses)
})

export const POST = withHasPermission("settingsUpdate")(async (request) => {
  const body = (await request.json()) as { name: string; label?: string }

  const status = await createStatus(body.name, body.label)

  return NextResponse.json(status, { status: 201 })
})
