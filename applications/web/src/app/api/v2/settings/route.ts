import { NextResponse } from "next/server"

import { getWatcher } from "@/assets/library/scanner/triggers/watcher"
import { withHasPermission } from "@/auth/auth"
import {
  createImportRule,
  deleteImportRules,
  getImportRules,
  getUserImportRules,
  updateImportRule,
} from "@/database/importRules"
import {
  validateWatchRulePath,
  watchRuleValidationMessage,
} from "@/database/importRules.validation"
import {
  getConfigImportRules,
  getSettings,
  updateSettings,
} from "@/database/settings"
import { type ImportRuleInput, type Settings } from "@/database/settingsTypes"
import { ASSETS_DIR, UPLOADS_DIR } from "@/directories"
import { type UUID } from "@/uuid"

export const dynamic = "force-dynamic"

/**
 * @summary Get the current server settings
 */
export const GET = withHasPermission("settingsUpdate")(async (req) => {
  const exportConfig = req.nextUrl.searchParams.get("exportConfig") === "true"

  const [settings, allRules] = await Promise.all([
    getSettings(),
    getImportRules(),
  ])

  const importRules = allRules
    .filter((r) => r.source === "user" || r.source === "config")
    .map((r) => ({
      uuid: r.uuid,
      kind: r.kind,
      path: r.path,
      importMode: r.importMode,
      epub2ImportStrategy: r.epub2ImportStrategy,
      source: r.source,
      bookUuid: r.bookUuid,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      collections: r.collections,
      bookTitle: r.bookTitle,
    }))

  const autoIgnoreRules = allRules
    .filter(
      (r) =>
        r.source !== "user" && r.source !== "config" && r.kind === "ignore",
    )
    .map((r) => ({
      uuid: r.uuid,
      path: r.path,
      source: r.source,
      bookTitle: r.bookTitle,
    }))

  return NextResponse.json({
    ...settings,
    ...(exportConfig
      ? {
          importRules: importRules.map((r) => ({
            importMode: r.importMode,
            epub2ImportStrategy: r.epub2ImportStrategy,
            path: r.path,
            kind: r.kind,
          })),
        }
      : { importRules, autoIgnoreRules }),
  })
})

/**
 * @summary Update the server settings
 */
export const PUT = withHasPermission("settingsUpdate")(async (request) => {
  const body = (await request.json()) as Settings & {
    importRules?: ImportRuleInput[]
    autoIgnoreRules?: unknown
    deleteRuleUuids?: string[]
  }

  const {
    importRules: incomingRules,
    autoIgnoreRules: _,
    deleteRuleUuids,
    ...settings
  } = body

  await updateSettings(settings)

  if (deleteRuleUuids && deleteRuleUuids.length > 0) {
    await deleteImportRules(deleteRuleUuids as UUID[])
  }

  if (incomingRules) {
    // don't update config rules
    const configRules = await getConfigImportRules()
    const userRules = incomingRules.filter(
      (r) => !configRules.some((c) => c.kind === r.kind && c.path === r.path),
    )

    const validationError = await reconcileImportRules(userRules)

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }
  }

  await getWatcher().reload()
  return new Response(null, { status: 204 })
})

async function reconcileImportRules(
  incoming: ImportRuleInput[],
): Promise<string | null> {
  const existing = await getUserImportRules()
  const existingByUuid = new Map(existing.map((r) => [r.uuid, r]))

  const incomingUuids = new Set(
    incoming.map((r) => r.uuid).filter((uuid) => uuid != null),
  )

  // validate all watch rule paths against each other
  for (const rule of incoming) {
    if (rule.kind !== "watch") continue

    const existingForValidation = incoming
      .filter((r) => r !== rule)
      .map((r) => ({
        uuid: (r.uuid ?? "") as UUID,
        kind: r.kind,
        path: r.path,
      }))

    const result = validateWatchRulePath({
      path: rule.path,
      existingRules: existingForValidation,
      excludeUuid: rule.uuid as UUID | undefined,
      forbiddenRoots: [ASSETS_DIR, UPLOADS_DIR],
    })

    if (!result.ok) {
      const conflictingPath = result.conflictWith
        ? incoming.find((r) => r.uuid === result.conflictWith)?.path
        : undefined
      return watchRuleValidationMessage(result, { conflictingPath })
    }
  }

  // delete rules that are no longer present
  const toDelete = existing
    .filter((r) => !incomingUuids.has(r.uuid))
    .map((r) => r.uuid)

  if (toDelete.length > 0) {
    await deleteImportRules(toDelete)
  }

  // create or update
  for (const rule of incoming) {
    if (rule.uuid && existingByUuid.has(rule.uuid as UUID)) {
      await updateImportRule(rule.uuid as UUID, {
        path: rule.path,
        importMode: rule.importMode ?? null,
        epub2ImportStrategy: rule.epub2ImportStrategy ?? null,
        collectionUuids: rule.collectionUuids as UUID[] | undefined,
      })
    } else {
      await createImportRule({
        kind: rule.kind,
        path: rule.path,
        importMode: rule.importMode ?? null,
        epub2ImportStrategy: rule.epub2ImportStrategy ?? null,
        collectionUuids: rule.collectionUuids as UUID[] | undefined,
      })
    }
  }

  return null
}
