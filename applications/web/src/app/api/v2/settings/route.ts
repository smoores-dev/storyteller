import { NextResponse } from "next/server"

import { getWatcher } from "@/assets/library/scanner/triggers/watcher"
import { withHasPermission } from "@/auth/auth"
import {
  createImportRule,
  deleteImportRules,
  getImportRules,
  getUserImportRules,
  splitSettingsImportRules,
  updateImportRule,
} from "@/database/importRules"
import {
  getConfigImportRules,
  getSettings,
  updateSettings,
} from "@/database/settings"
import {
  type ImportRuleInput,
  type Settings,
  importRuleIssues,
} from "@/database/settingsTypes"
import { ASSETS_DIR, UPLOADS_DIR } from "@/directories"
import { runLogRetention } from "@/logRetention"
import { type UUID } from "@/uuid"

export const dynamic = "force-dynamic"

async function settingsPayload() {
  const [settings, allRules] = await Promise.all([
    getSettings(),
    getImportRules(),
  ])

  return { ...settings, ...splitSettingsImportRules(allRules) }
}

/**
 * @summary Get the current server settings
 */
export const GET = withHasPermission("settingsUpdate")(async (req) => {
  const exportConfig = req.nextUrl.searchParams.get("exportConfig") === "true"

  if (!exportConfig) {
    return NextResponse.json(await settingsPayload())
  }

  const [settings, allRules] = await Promise.all([
    getSettings(),
    getImportRules(),
  ])
  const { importRules } = splitSettingsImportRules(allRules)

  return NextResponse.json({
    ...settings,
    importRules: importRules.map((r) => ({
      importMode: r.importMode,
      epub2ImportStrategy: r.epub2ImportStrategy,
      path: r.path,
      kind: r.kind,
    })),
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

  if (incomingRules) {
    const issues = importRuleIssues(incomingRules, [ASSETS_DIR, UPLOADS_DIR])

    if (issues.length > 0) {
      return NextResponse.json(
        {
          error: issues[0]?.message,
          fieldErrors: issues.map((issue) => ({
            path: `importRules.${issue.index}.path`,
            message: issue.message,
          })),
        },
        { status: 400 },
      )
    }
  }

  await updateSettings(settings)

  if (deleteRuleUuids && deleteRuleUuids.length > 0) {
    await deleteImportRules(deleteRuleUuids as UUID[])
  }

  if (incomingRules) {
    const configRules = await getConfigImportRules()
    const userRules = incomingRules.filter(
      (r) => !configRules.some((c) => c.kind === r.kind && c.path === r.path),
    )

    await reconcileImportRules(userRules)
  }

  await getWatcher().reload()

  if (settings.logRetentionDays !== undefined) {
    void runLogRetention()
  }

  return NextResponse.json(await settingsPayload())
})

async function reconcileImportRules(incoming: ImportRuleInput[]) {
  const existing = await getUserImportRules()
  const existingByUuid = new Map(existing.map((r) => [r.uuid, r]))

  const incomingUuids = new Set(
    incoming.map((r) => r.uuid).filter((uuid) => uuid != null),
  )

  const toDelete = existing
    .filter((r) => !incomingUuids.has(r.uuid))
    .map((r) => r.uuid)

  if (toDelete.length > 0) {
    await deleteImportRules(toDelete)
  }

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
}
