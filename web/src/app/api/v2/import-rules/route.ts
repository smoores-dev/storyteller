import { NextResponse } from "next/server"

import { getWatcher } from "@/assets/library/scanner/triggers/watcher"
import { withHasPermission } from "@/auth/auth"
import {
  type CreateImportRuleInput,
  createImportRule,
  deleteImportRules,
  getImportRules,
} from "@/database/importRules"
import {
  validateWatchRulePath,
  watchRuleValidationMessage,
} from "@/database/importRules.validation"
import { ASSETS_DIR, UPLOADS_DIR } from "@/directories"
import { type UUID } from "@/uuid"

export const dynamic = "force-dynamic"

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

  const existing = await getImportRules()

  if (body.kind === "watch") {
    const result = validateWatchRulePath({
      path: body.path,
      existingRules: existing,
      forbiddenRoots: [ASSETS_DIR, UPLOADS_DIR],
    })
    if (!result.ok) {
      const conflictingPath = result.conflictWith
        ? existing.find((r) => r.uuid === result.conflictWith)?.path
        : undefined
      return NextResponse.json(
        {
          error: watchRuleValidationMessage(result, { conflictingPath }),
          code: result.error,
          ...(result.conflictWith && { conflictWith: result.conflictWith }),
        },
        { status: 400 },
      )
    }
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
