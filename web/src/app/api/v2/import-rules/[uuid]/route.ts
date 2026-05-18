import { resolve } from "node:path"

import { NextResponse } from "next/server"

import { getWatcher } from "@/assets/library/scanner/triggers/watcher"
import { withHasPermission } from "@/auth/auth"
import {
  type UpdateImportRuleInput,
  deleteImportRule,
  updateImportRule,
} from "@/database/importRules"
import { ASSETS_DIR, UPLOADS_DIR } from "@/directories"
import { type UUID } from "@/uuid"

export const dynamic = "force-dynamic"

function isForbiddenPath(path: string): boolean {
  const resolved = resolve(path)
  const assetsResolved = resolve(ASSETS_DIR)
  const uploadsResolved = resolve(UPLOADS_DIR)

  return (
    resolved === assetsResolved ||
    resolved.startsWith(assetsResolved + "/") ||
    resolved === uploadsResolved ||
    resolved.startsWith(uploadsResolved + "/")
  )
}

type Params = Promise<{ uuid: UUID }>

export const PUT = withHasPermission<Params>("settingsUpdate")(async (
  request,
  context,
) => {
  const { uuid } = await context.params

  const body = (await request.json()) as {
    path?: string
    importMode?: string | null
    collectionUuids?: UUID[]
  }

  if (body.path && isForbiddenPath(body.path)) {
    return NextResponse.json(
      {
        error:
          "Cannot use the internal assets or uploads directory as an import rule path.",
      },
      { status: 400 },
    )
  }

  const input: UpdateImportRuleInput = {
    path: body.path,
    importMode: body.importMode,
    collectionUuids: body.collectionUuids,
  }

  const rule = await updateImportRule(uuid, input)

  await getWatcher().reload()

  return NextResponse.json(rule)
})

export const DELETE = withHasPermission<Params>("settingsUpdate")(async (
  _request,
  context,
) => {
  const { uuid } = await context.params

  await deleteImportRule(uuid)
  await getWatcher().reload()

  return new Response(null, { status: 204 })
})
