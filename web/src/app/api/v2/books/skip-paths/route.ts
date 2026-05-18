import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { getImportRules, removeIgnoreRules } from "@/database/importRules"

export const dynamic = "force-dynamic"

/** @deprecated use /api/v2/import-rules instead */
export const GET = withHasPermission("settingsUpdate")(async () => {
  const rules = await getImportRules("ignore")

  const paths = rules.map((r) => ({
    filepath: r.path,
    uuid: null,
    title: null,
  }))

  return NextResponse.json(paths)
})

/** @deprecated use /api/v2/import-rules instead */
export const DELETE = withHasPermission("settingsUpdate")(async (request) => {
  const { paths } = (await request.json()) as { paths: string[] }

  if (!paths.length) {
    return new Response(null, { status: 204 })
  }

  await removeIgnoreRules(paths)

  return new Response(null, { status: 204 })
})
