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

  const allRules = await getImportRules()
  if (allRules.find((r) => r.uuid === uuid)?.source === "config") {
    return NextResponse.json(
      { error: "Rules from the config file cannot be modified." },
      { status: 403 },
    )
  }

  const body = (await request.json()) as {
    path?: string
    importMode?: string | null
    epub2ImportStrategy?: string | null
    collectionUuids?: UUID[]
  }

  if (body.path) {
    const existing = await getImportRules()
    const self = existing.find((r) => r.uuid === uuid)
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
    epub2ImportStrategy: body.epub2ImportStrategy,
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

  const allRules = await getImportRules()
  if (allRules.find((r) => r.uuid === uuid)?.source === "config") {
    return NextResponse.json(
      { error: "Rules from the config file cannot be deleted." },
      { status: 403 },
    )
  }

  await deleteImportRule(uuid)
  await getWatcher().reload()

  return new Response(null, { status: 204 })
})
