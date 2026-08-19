import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import {
  type HomeSectionInput,
  ensureHomeSectionDefaults,
  getHomeSections,
  setHomeSections,
} from "@/database/shelves"

export const dynamic = "force-dynamic"

export const GET = withHasPermission("bookList")(async (request) => {
  const user = request.auth.user
  await ensureHomeSectionDefaults(user.id)
  const sections = await getHomeSections(user.id)

  return NextResponse.json(sections)
})

export const PUT = withHasPermission("bookList")(async (request) => {
  const user = request.auth.user

  const body = (await request.json()) as HomeSectionInput[]

  await setHomeSections(user.id, body)
  const sections = await getHomeSections(user.id)

  return NextResponse.json(sections)
})
