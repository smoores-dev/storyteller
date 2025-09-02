import { update } from "@/assets/autoimport/listen"

import { db } from "./connection"
import { type Settings } from "./settingsTypes"

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

export async function getSetting<Name extends keyof Settings>(name: Name) {
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

  const result = rows.reduce(
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

  return {
    ...result,
    smtpSsl: result.smtpSsl ?? true,
    smtpRejectUnauthorized: result.smtpRejectUnauthorized ?? true,
  }
}

export async function updateSettings(settings: Settings) {
  for (const [settingName, value] of Object.entries(settings)) {
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
