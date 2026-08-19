import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { createTag, getTags } from "@/database/tags"

/**
 * @summary List all tags
 * @desc '
 */
export const GET = withHasPermission("bookList")(async (request) => {
  const { searchParams } = new URL(request.url)
  const order = searchParams.get("order") === "desc" ? "desc" : "asc"
  const limit = searchParams.get("limit")
  const tags = await getTags(request.auth.user.id, {
    order,
    ...(limit && { limit: Number(limit) }),
  })

  return NextResponse.json(tags)
})

export const POST = withHasPermission("bookUpdate")(async (request) => {
  const { name, icon, color } = (await request.json()) as {
    name: string
    icon?: string | null
    color?: string | null
  }

  const created = await createTag({ name, icon, color })

  return NextResponse.json(created)
})
