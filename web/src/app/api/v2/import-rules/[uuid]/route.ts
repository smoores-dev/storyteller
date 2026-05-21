import { NextResponse } from "next/server"

import { getWatcher } from "@/assets/library/scanner/triggers/watcher"
import { withHasPermission } from "@/auth/auth"
import {
  type UpdateImportRuleInput,
  deleteImportRule,
  getImportRules,
  updateImportRule,
} from "@/database/importRules"
import {
  validateWatchRulePath,
  watchRuleValidationMessage,
} from "@/database/importRules.validation"
import { ASSETS_DIR, UPLOADS_DIR } from "@/directories"
import { type UUID } from "@/uuid"

export const dynamic = "force-dynamic"

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

  if (body.path) {
    const existing = await getImportRules()
    const self = existing.find((r) => r.uuid === uuid)
    // path validation only matters for watch rules. for the rule under edit
    // we honor its current kind, since this endpoint doesn't change kind.
    if (self?.kind === "watch") {
      const result = validateWatchRulePath({
        path: body.path,
        existingRules: existing,
        excludeUuid: uuid,
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
