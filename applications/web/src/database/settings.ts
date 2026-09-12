import { readFileSync } from "node:fs"
import { readFile } from "node:fs/promises"

import { ZodError, z } from "zod"

import { getScheduler } from "@/assets/library/scanner/triggers/scheduler"
import { env } from "@/env"
import { logger } from "@/logging"
import { decryptSecret, encryptSecret } from "@/secrets"

import { db } from "./connection"
import {
  type AuthProvider,
  ConfigFileSchema,
  type Epub2ImportStrategy,
  type ImportMode,
  ImportRuleSchema,
  type Settings,
  isEncryptedSettingKey,
} from "./settingsTypes"
import {
  type PreferenceDefaults,
  PreferenceDefaultsSchema,
  type PreferenceDefaultsUpdate,
} from "./userPreferencesTypes"

async function decryptSettingValue(name: string, value: unknown) {
  if (isEncryptedSettingKey(name) && typeof value === "string" && value) {
    return (await decryptSecret(value)) ?? ""
  }

  if (name === "authProviders" && Array.isArray(value)) {
    return await Promise.all(
      (value as AuthProvider[]).map(async (provider) => ({
        ...provider,
        clientSecret: provider.clientSecret
          ? ((await decryptSecret(provider.clientSecret)) ?? "")
          : provider.clientSecret,
      })),
    )
  }

  return value
}

async function encryptSettingValue(name: string, value: unknown) {
  if (isEncryptedSettingKey(name) && typeof value === "string" && value) {
    return await encryptSecret(value)
  }

  if (name === "authProviders" && Array.isArray(value)) {
    return await Promise.all(
      (value as AuthProvider[]).map(async (provider) => ({
        ...provider,
        clientSecret: provider.clientSecret
          ? await encryptSecret(provider.clientSecret)
          : provider.clientSecret,
      })),
    )
  }

  return value
}

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

export type ConfigImportRuleEntry = {
  kind: "watch" | "ignore"
  path: string
  importMode: ImportMode | null
  epub2ImportStrategy: Epub2ImportStrategy | null
}

type ConfigFileCache = {
  settings: Partial<Settings>
  keys: Set<keyof Settings>
  importRules: ConfigImportRuleEntry[]
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

async function loadConfigFile(): Promise<ConfigFileCache> {
  if (globalThis.configFileCache) return globalThis.configFileCache

  const configPath = env.STORYTELLER_CONFIG

  if (!configPath) {
    globalThis.configFileCache = {
      settings: {},
      keys: new Set(),
      importRules: [],
    }
    return globalThis.configFileCache
  }

  let rawConfig: unknown
  try {
    rawConfig = JSON.parse(await readFile(configPath, "utf-8")) as unknown
  } catch (err) {
    throw new Error(
      `Failed to read config file "${configPath}": ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  const resolved = resolveFileReferences(rawConfig)

  const configObj = resolved as Record<string, unknown>
  const {
    importRules: rawImportRules,
    importPath: rawImportPath,
    ...rawSettings
  } = configObj

  let settings: Partial<Settings>
  try {
    // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- tsgolint treats the cast as unnecessary but it still narrows the type
    settings = ConfigFileSchema.parse(rawSettings) as Partial<Settings>
  } catch (err) {
    if (err instanceof ZodError) {
      throw new Error(`Invalid config file "${configPath}": ${err.message}`)
    }
    throw err
  }

  // validate and collect explicit importRules
  const explicitRules = rawImportRules
    ? z.array(ImportRuleSchema).parse(rawImportRules)
    : []

  // convert deprecated importPath to watch rules
  let legacyRules: ConfigImportRuleEntry[] = []

  if (rawImportPath !== undefined) {
    logger.warn(
      "config file contains 'importPath' which is deprecated; " +
        "please migrate to 'importRules' instead.",
    )

    const importPathSchema = z.union([z.string(), z.array(ImportRuleSchema)])
    const parsed = importPathSchema.parse(rawImportPath)

    const entries = Array.isArray(parsed) ? parsed : [{ path: parsed }]

    legacyRules = entries.map((e) => ({
      kind: "watch" as const,
      path: e.path,
      importMode: ("importMode" in e ? e.importMode : null) ?? null,
      epub2ImportStrategy: null,
    }))
  }

  // explicit importRules take precedence over legacy importPath
  const seen = new Set<string>()
  const allRules: ConfigImportRuleEntry[] = []

  for (const rule of [...explicitRules, ...legacyRules]) {
    const key = `${rule.kind}:${rule.path}`
    if (seen.has(key)) continue

    seen.add(key)
    allRules.push({
      kind: rule.kind,
      path: rule.path,
      importMode: rule.importMode ?? null,
      epub2ImportStrategy: rule.epub2ImportStrategy ?? null,
    })
  }

  const keys = new Set(Object.keys(settings) as (keyof Settings)[])

  globalThis.configFileCache = { settings, keys, importRules: allRules }
  return globalThis.configFileCache
}

/** Returns the set of setting keys that are locked by the config file */
export async function getConfigLockedKeys(): Promise<Set<keyof Settings>> {
  const configFileCache = await loadConfigFile()
  return configFileCache.keys
}

export async function getSetting<Name extends keyof Settings>(name: Name) {
  const { settings: configSettings, keys } = await loadConfigFile()

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

  return (await decryptSettingValue(name, parsed)) as Settings[Name]
}

export async function getSettings(): Promise<Settings> {
  const rows = await db
    .selectFrom("settings")
    .select(["name", "value"])
    .execute()

  const decrypted = await Promise.all(
    rows.map(async (row) => {
      const parsed =
        typeof row.value === "string"
          ? (JSON.parse(row.value) as Settings[keyof Settings])
          : row.value
      return [row.name, await decryptSettingValue(row.name, parsed)] as const
    }),
  )

  const dbDesttings = Object.fromEntries(decrypted) as Settings

  const { settings: configSettings } = await loadConfigFile()

  const result = {
    ...dbDesttings,
    smtpSsl: dbDesttings.smtpSsl ?? true,
    smtpRejectUnauthorized: dbDesttings.smtpRejectUnauthorized ?? true,
    backupCronExpression: dbDesttings.backupCronExpression ?? null,
    backupRetentionCount: dbDesttings.backupRetentionCount ?? null,
    logRetentionDays: dbDesttings.logRetentionDays ?? null,
  }

  return { ...result, ...configSettings }
}

export async function updateSettings(settings: Settings) {
  const lockedKeys = await getConfigLockedKeys()
  const existingSettings = await getSettings()

  for (const [settingName, value] of Object.entries(settings)) {
    if (lockedKeys.has(settingName as keyof Settings)) continue
    if (settingName === "dataDirAnchor") continue

    const unchanged =
      JSON.stringify(existingSettings[settingName as keyof Settings]) ===
      JSON.stringify(value)

    if (unchanged) continue

    const stored = JSON.stringify(
      // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- tsgolint treats the cast as unnecessary but it still narrows the type
      await encryptSettingValue(settingName, value as unknown),
    )

    await db
      .insertInto("settings")
      .values({
        name: settingName as keyof Settings,
        value: stored,
      })
      .onConflict((oc) => oc.column("name").doUpdateSet({ value: stored }))
      .execute()
  }

  await getScheduler().refresh()
  const { getBackupScheduler } = await import("@/backupScheduler")
  await getBackupScheduler().refresh()
}

export async function getPreferenceDefaults(): Promise<PreferenceDefaults> {
  const { settings: configSettings, keys } = await loadConfigFile()

  if (keys.has("preferenceDefaults")) {
    return configSettings["preferenceDefaults"] ?? {}
  }

  const row = await db
    .selectFrom("settings")
    .select(["value"])
    .where("name", "=", "preferenceDefaults")
    .orderBy("createdAt", "desc")
    .executeTakeFirst()

  if (!row) return {}

  const parsed: unknown =
    typeof row.value === "string" ? JSON.parse(row.value) : row.value

  const result = PreferenceDefaultsSchema.safeParse(parsed)
  return result.success ? result.data : {}
}

export async function isPreferenceDefaultsLocked(): Promise<boolean> {
  const lockedKeys = await getConfigLockedKeys()
  return lockedKeys.has("preferenceDefaults")
}

export async function setPreferenceDefaults(update: PreferenceDefaultsUpdate) {
  const current = await getPreferenceDefaults()
  const merged = Object.fromEntries(
    Object.entries({ ...current, ...update }).filter(
      ([, entry]) => entry != null,
    ),
  ) as PreferenceDefaults
  const value = JSON.stringify(merged)

  await db
    .insertInto("settings")
    .values({ name: "preferenceDefaults", value })
    .onConflict((oc) => oc.column("name").doUpdateSet({ value }))
    .execute()

  return merged
}

// validate and cache config file on startup (never re-read after this)
void loadConfigFile()

export async function getConfigImportRules(): Promise<ConfigImportRuleEntry[]> {
  const configFileCache = await loadConfigFile()
  return configFileCache.importRules
}
