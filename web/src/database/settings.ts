import { readFileSync } from "node:fs"

import { ZodError } from "zod"

import { getScheduler } from "@/assets/library/scanner/triggers/scheduler"
import { getWatcher } from "@/assets/library/scanner/triggers/watcher"
import { env } from "@/env"
import { logger } from "@/logging"

import { db } from "./connection"
import {
  ConfigFileSchema,
  type ImportPathEntry,
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

// handles legacy single-string values, string arrays, and the literal string "null"
function normalizeImportPaths(raw: unknown): ImportPathEntry[] | null {
  if (raw === null || raw === undefined || raw === "null") return null

  if (typeof raw === "string") return [{ path: raw }]

  if (Array.isArray(raw)) {
    if (raw.length === 0) return null

    return raw.map((item) =>
      typeof item === "string" ? { path: item } : (item as ImportPathEntry),
    )
  }

  return null
}

function normalizeSettingValue<Name extends keyof Settings>(
  name: Name,
  value: unknown,
): Settings[Name] {
  if (name === "importPath") {
    return normalizeImportPaths(value) as Settings[Name]
  }
  return value as Settings[Name]
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

  return normalizeSettingValue(
    name,
    typeof valueJson === "string" ? JSON.parse(valueJson) : valueJson,
  )
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
      [name]: normalizeSettingValue(name, parsed),
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

function computeNewImportPaths(
  previous: ImportPathEntry[] | null,
  next: ImportPathEntry[] | null,
): string[] {
  const prevSet = new Set((previous ?? []).map((e) => e.path))
  return (next ?? []).filter((e) => !prevSet.has(e.path)).map((e) => e.path)
}

function validateNoDuplicatePaths(paths: ImportPathEntry[] | null) {
  if (!paths) return

  const seen = new Set<string>()

  for (const entry of paths) {
    if (seen.has(entry.path)) {
      throw new Error(`duplicate import path: "${entry.path}"`)
    }
    seen.add(entry.path)
  }
}

export async function getCollectionImportPaths(): Promise<Set<string>> {
  const rows = await db
    .selectFrom("collection")
    .select(["importPaths"])
    .where("importPaths", "is not", null)
    .execute()

  return new Set(
    rows.flatMap((row) =>
      ((row.importPaths ?? []) as (string | ImportPathEntry)[]).map((item) =>
        typeof item === "string" ? item : item.path,
      ),
    ),
  )
}

export async function updateSettings(settings: Settings) {
  const lockedKeys = getConfigLockedKeys()
  const existingSettings = await getSettings()

  if (settings.importPath) {
    validateNoDuplicatePaths(settings.importPath)

    const collectionPaths = await getCollectionImportPaths()
    const conflicts = settings.importPath.filter((e) =>
      collectionPaths.has(e.path),
    )

    if (conflicts.length > 0) {
      throw new Error(
        `import path already used by a collection: "${conflicts[0]?.path}"`,
      )
    }
  }

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

  await getWatcher().update("root")
  await getScheduler().refresh()

  const newPaths = computeNewImportPaths(
    existingSettings.importPath,
    settings.importPath,
  )

  if (newPaths.length > 0) {
    logger.info({
      msg: "import paths changed, triggering scan for new paths",
      newPaths,
    })

    // dynamic import to avoid circular dependency (scan -> settings -> scan)
    const { scan } = await import("@/assets/library/scanner/scan")

    void scan({
      source: "manual",
      tasks: newPaths.map((importPath) => ({
        kind: "import-path" as const,
        importPath,
        collection: "root" as const,
      })),
      signal: new AbortController().signal,
    })
  }
}

// Validate and cache config file on startup (never re-read after this)
loadConfigFile()
