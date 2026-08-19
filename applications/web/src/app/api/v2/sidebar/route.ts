import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import {
  type SidebarGroupInput,
  ensureSidebarDefaults,
  getSidebarGroups,
  setSidebarGroups,
} from "@/database/sidebar"

export const dynamic = "force-dynamic"

export const GET = withHasPermission("bookList")(async (request) => {
  const user = request.auth.user
  await ensureSidebarDefaults(user.id)
  const groups = await getSidebarGroups(user.id)

  return NextResponse.json(groups)
})

export const PUT = withHasPermission("bookList")(async (request) => {
  const user = request.auth.user
  const body = (await request.json()) as SidebarGroupInput[]

  await setSidebarGroups(user.id, body)
  const groups = await getSidebarGroups(user.id)

  return NextResponse.json(groups)
})
