import { readFileSync } from "node:fs"

import { ZodError } from "zod"

import { update } from "@/assets/autoimport/listen"
import { env } from "@/env"

import { db } from "./connection"
import { ConfigFileSchema, type Settings } from "./settingsTypes"

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
    .executeTakeFirstOrThrow()
  return JSON.parse(valueJson) as Settings[Name]
}

export async function getSettings(): Promise<Settings> {
  const rows = await db
    .selectFrom("settings")
    .select(["name", "value"])
    .execute()
  const dbSettings = rows.reduce(
    (acc, row) => ({
      ...acc,
      [row.name]:
        // We configured Kysely to auto-parse JSON objects and arrays,
        // so we need to guard against values that have already been parsed
        typeof row.value === "string"
          ? (JSON.parse(row.value) as Settings[keyof Settings])
          : row.value,
    }),
    {},
  ) as Settings
  const result: Settings = {
    ...dbSettings,
    smtpSsl: dbSettings.smtpSsl ?? true,
    smtpRejectUnauthorized: dbSettings.smtpRejectUnauthorized ?? true,
  }
  const { settings: configSettings } = loadConfigFile()
  return { ...result, ...configSettings }
}

export async function updateSettings(settings: Settings) {
  const lockedKeys = getConfigLockedKeys()
  for (const [settingName, value] of Object.entries(settings)) {
    if (lockedKeys.has(settingName as keyof Settings)) continue
    await db
      .updateTable("settings")
      .set({
        value: JSON.stringify(value),
      })
      .where("name", "=", settingName as keyof Settings)
      .execute()
  }
  await update(null)
}

// Validate and cache config file on startup (never re-read after this)
loadConfigFile()
