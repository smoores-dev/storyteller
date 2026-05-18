import { readFileSync } from "node:fs"

import { ZodError } from "zod"

import { getScheduler } from "@/assets/library/scanner/triggers/scheduler"
import { env } from "@/env"
import { logger } from "@/logging"

import { db } from "./connection"
import { createImportRule, getImportRules } from "./importRules"
import {
  ConfigFileSchema,
  type ImportMode,
  type Settings,
} from "./settingsTypes"

export function formatTranscriptionEngineDetails(settings: Settings) {
  let details = settings.transcriptionEngine ?? "whisper.cpp"
  if (settings.transcriptionEngine === "whisper.cpp") {
    details += `:${settings.whisperModel ?? "tiny"}`
  }
  if (
    settings.transcriptionEngine === "openai-cloud" &&
    settings.openAiModelName
  ) {
    details += `:${settings.openAiModelName}`
  }
  if (settings.transcriptionEngine === "deepgram" && settings.deepgramModel) {
    details += `:${settings.deepgramModel}`
  }
  return details
}

type ConfigFileCache = {
  settings: Partial<Settings>
  keys: Set<keyof Settings>
}
// globalThis to survive Next.js module re-imports (see distributor.ts)
declare global {
  // eslint-disable-next-line no-var
  var configFileCache: ConfigFileCache | undefined
}

/** Recursively resolve _file references in an object */
function resolveFileReferences(obj: unknown): unknown {
  if (typeof obj !== "object" || obj === null) return obj
  if (Array.isArray(obj)) return obj.map(resolveFileReferences)
  const input = obj as Record<string, unknown>
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (key.endsWith("_file") && typeof value === "string") {
      // Replace foo_file with foo containing file contents
      const targetKey = key.slice(0, -5)
      try {
        result[targetKey] = readFileSync(value, "utf-8").trim()
      } catch (err) {
        throw new Error(
          `Failed to read secret file for "${targetKey}" from "${value}": ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    } else if (!(`${key}_file` in input)) {
      // Keep the key unless it will be overwritten by a _file variant
      result[key] = resolveFileReferences(value)
    }
  }
  return result
}

function loadConfigFile(): ConfigFileCache {
  if (globalThis.configFileCache) return globalThis.configFileCache
  const configPath = env.STORYTELLER_CONFIG
  if (!configPath) {
    globalThis.configFileCache = { settings: {}, keys: new Set() }
    return globalThis.configFileCache
  }
  let rawConfig: unknown
  try {
    rawConfig = JSON.parse(readFileSync(configPath, "utf-8")) as unknown
  } catch (err) {
    throw new Error(
      `Failed to read config file "${configPath}": ${err instanceof Error ? err.message : String(err)}`,
    )
  }
  const resolved = resolveFileReferences(rawConfig)
  let settings: Partial<Settings>
  try {
    settings = ConfigFileSchema.parse(resolved) as Partial<Settings>
  } catch (err) {
    if (err instanceof ZodError) {
      throw new Error(`Invalid config file "${configPath}": ${err.message}`)
    }
    throw err
  }
  const keys = new Set(Object.keys(settings) as (keyof Settings)[])
  globalThis.configFileCache = { settings, keys }
  return globalThis.configFileCache
}

/** Returns the set of setting keys that are locked by the config file */
export function getConfigLockedKeys(): Set<keyof Settings> {
  return loadConfigFile().keys
}

export async function getSetting<Name extends keyof Settings>(name: Name) {
  const { settings: configSettings, keys } = loadConfigFile()

  if (keys.has(name)) {
    return configSettings[name] as Settings[Name]
  }

  const { valueJson } = await db
    .selectFrom("settings")
    .select(["value as valueJson"])
    .where("name", "=", name)
    .orderBy("createdAt", "desc")
    .executeTakeFirstOrThrow()

  const parsed: unknown =
    typeof valueJson === "string" ? JSON.parse(valueJson) : valueJson

  return parsed as Settings[Name]
}

export async function getSettings(): Promise<Settings> {
  const rows = await db
    .selectFrom("settings")
    .select(["name", "value"])
    .execute()

  const dbDesttings = rows.reduce((acc, row) => {
    const name = row.name
    const parsed =
      typeof row.value === "string"
        ? (JSON.parse(row.value) as Settings[keyof Settings])
        : row.value
    return {
      ...acc,
      [name]: parsed,
    }
  }, {}) as Settings

  const { settings: configSettings } = loadConfigFile()

  const result = {
    ...dbDesttings,
    smtpSsl: dbDesttings.smtpSsl ?? true,
    smtpRejectUnauthorized: dbDesttings.smtpRejectUnauthorized ?? true,
  }

  return { ...result, ...configSettings }
}

export async function updateSettings(settings: Settings) {
  const lockedKeys = getConfigLockedKeys()
  const existingSettings = await getSettings()

  for (const [settingName, value] of Object.entries(settings)) {
    if (lockedKeys.has(settingName as keyof Settings)) continue

    const unchanged =
      JSON.stringify(existingSettings[settingName as keyof Settings]) ===
      JSON.stringify(value)

    if (unchanged) continue

    await db
      .insertInto("settings")
      .values({
        name: settingName as keyof Settings,
        value: JSON.stringify(value),
      })
      .onConflict((oc) =>
        oc.column("name").doUpdateSet({ value: JSON.stringify(value) }),
      )
      .execute()
  }

  await getScheduler().refresh()
}

// Validate and cache config file on startup (never re-read after this)
loadConfigFile()

type ConfigImportPathEntry = { path: string; importMode?: ImportMode | null }

/**
 * if the config file still has importPath entries, sync them to import rules.
 * this is a deprecated compatibility path; users should migrate to configuring
 * import rules through the ui.
 */
export async function syncConfigFileImportPaths() {
  const configPath = env.STORYTELLER_CONFIG
  if (!configPath) return

  let rawConfig: Record<string, unknown>

  try {
    const { readFileSync } = await import("node:fs")
    rawConfig = JSON.parse(readFileSync(configPath, "utf-8")) as Record<
      string,
      unknown
    >
  } catch {
    return
  }

  const rawImportPath = rawConfig["importPath"]
  if (!rawImportPath) return

  logger.warn(
    "config file contains 'importPath' which is deprecated. " +
      "these entries have been synced to import rules. " +
      "please remove 'importPath' from your config file and use the settings ui instead.",
  )

  const entries: ConfigImportPathEntry[] = Array.isArray(rawImportPath)
    ? (rawImportPath as ConfigImportPathEntry[])
    : typeof rawImportPath === "string"
      ? [{ path: rawImportPath }]
      : []

  if (entries.length === 0) return

  const existingRules = await getImportRules("watch")
  const existingPaths = new Set(existingRules.map((r) => r.path))

  for (const entry of entries) {
    if (existingPaths.has(entry.path)) continue

    await createImportRule({
      kind: "watch",
      path: entry.path,
      importMode: entry.importMode ?? null,
    })
  }
}
