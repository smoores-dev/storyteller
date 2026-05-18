import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import {
  getImportSkipPaths,
  removeImportSkipPaths,
} from "@/database/importSkipPaths"

export const dynamic = "force-dynamic"

export const GET = withHasPermission("settingsUpdate")(async () => {
  const paths = await getImportSkipPaths()
  return NextResponse.json(paths)
})

export const DELETE = withHasPermission("settingsUpdate")(async (request) => {
  const { paths } = (await request.json()) as { paths: string[] }

  if (!paths.length) {
    return new Response(null, { status: 204 })
  }

  await removeImportSkipPaths(paths)

  return new Response(null, { status: 204 })
})
