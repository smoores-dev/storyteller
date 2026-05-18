import { resolve } from "node:path"

import { NextResponse } from "next/server"

import { getWatcher } from "@/assets/library/scanner/triggers/watcher"
import { withHasPermission } from "@/auth/auth"
import {
  type CreateImportRuleInput,
  createImportRule,
  deleteImportRules,
  getImportRules,
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

export const GET = withHasPermission("settingsUpdate")(async () => {
  const rules = await getImportRules()
  return NextResponse.json(rules)
})

export const POST = withHasPermission("settingsUpdate")(async (request) => {
  const body = (await request.json()) as {
    kind: "watch" | "ignore"
    path: string
    importMode?: string | null
    collectionUuids?: UUID[]
  }

  if (isForbiddenPath(body.path)) {
    return NextResponse.json(
      {
        error:
          "Cannot use the internal assets or uploads directory as an import rule path.",
      },
      { status: 400 },
    )
  }

  const input: CreateImportRuleInput = {
    kind: body.kind,
    path: body.path,
    importMode: body.importMode,
    collectionUuids: body.collectionUuids,
  }

  const rule = await createImportRule(input)

  if (rule.kind === "watch") {
    await getWatcher().reload()
  }

  return NextResponse.json(rule, { status: 201 })
})

export const DELETE = withHasPermission("settingsUpdate")(async (request) => {
  const body = (await request.json()) as { uuids: UUID[] }

  await deleteImportRules(body.uuids)
  await getWatcher().reload()

  return new NextResponse(null, { status: 204 })
})
