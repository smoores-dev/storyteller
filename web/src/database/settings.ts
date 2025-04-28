import { getDatabase } from "./connection"
import { SETTINGS_ROW_NAMES, Settings } from "./settingsTypes"

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

export async function getSetting<Name extends keyof typeof SETTINGS_ROW_NAMES>(
  name: Name,
) {
  const db = getDatabase()

  const { valueJson } = await db
    .selectFrom("settings")
    .select(["value as valueJson"])
    .where("name", "=", name)
    .executeTakeFirstOrThrow()

  return JSON.parse(valueJson) as Settings[(typeof SETTINGS_ROW_NAMES)[Name]]
}

export async function getSettings(): Promise<Settings> {
  const db = getDatabase()

  const rows = await db
    .selectFrom("settings")
    .select(["name", "value"])
    .execute()

  const result = rows.reduce(
    (acc, row) => ({
      ...acc,
      [SETTINGS_ROW_NAMES[row.name]]: JSON.parse(row.value) as
        | string
        | number
        | boolean
        | null,
    }),
    {},
  ) as Settings

  return {
    ...result,
    smtpSsl: result.smtpSsl ?? true,
    smtpRejectUnauthorized: result.smtpRejectUnauthorized ?? true,
  }
}

export async function updateSettings(settings: Settings) {
  const db = getDatabase()

  for (const [columnName, propertyName] of Object.entries(SETTINGS_ROW_NAMES)) {
    await db
      .updateTable("settings")
      .set({
        name: columnName as keyof typeof SETTINGS_ROW_NAMES,
        value: JSON.stringify(settings[propertyName]),
      })
      .execute()
  }
}
