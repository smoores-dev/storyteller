import { getDatabase } from "./connection"

export type TranscriptionEngine =
  | "whisper.cpp"
  | "google-cloud"
  | "microsoft-azure"
  | "amazon-transcribe"
  | "openai-cloud"

export type WhisperBuild =
  | "cpu"
  | "cublas-11.8"
  | "cublas-12.6"
  | "openblas"
  | "hipblas"

export type WhisperModel =
  | "tiny"
  | "tiny-q5_1"
  | "base"
  | "base-q5_1"
  | "small"
  | "small-q5_1"
  | "medium"
  | "medium-q5_0"
  | "large-v1"
  | "large-v2"
  | "large-v2-q5_0"
  | "large-v3"
  | "large-v3-q5_0"
  | "large-v3-turbo"
  | "large-v3-turbo-q5_0"

export type Settings = {
  smtpHost?: string
  smtpPort?: number
  smtpUsername?: string
  smtpPassword?: string
  smtpFrom?: string
  smtpSsl?: boolean
  smtpRejectUnauthorized?: boolean
  libraryName?: string
  webUrl?: string
  maxTrackLength?: number | null
  codec?: string | null
  bitrate?: string | null
  transcriptionEngine?: TranscriptionEngine | null
  whisperBuild?: WhisperBuild | null
  whisperModel?: WhisperModel | null
  googleCloudApiKey?: string | null
  azureSubscriptionKey?: string | null
  azureServiceRegion?: string | null
  amazonTranscribeRegion?: string | null
  amazonTranscribeAccessKeyId?: string | null
  amazonTranscribeSecretAccessKey?: string | null
  openAiApiKey?: string | null
  openAiOrganization?: string | null
  openAiBaseUrl?: string | null
  openAiModelName?: string | null
}

export const SETTINGS_COLUMN_NAMES = {
  smtp_host: "smtpHost",
  smtp_port: "smtpPort",
  smtp_username: "smtpUsername",
  smtp_password: "smtpPassword",
  smtp_from: "smtpFrom",
  smtp_ssl: "smtpSsl",
  smtp_reject_unauthorized: "smtpRejectUnauthorized",
  library_name: "libraryName",
  web_url: "webUrl",
  max_track_length: "maxTrackLength",
  codec: "codec",
  bitrate: "bitrate",
  transcription_engine: "transcriptionEngine",
  whisper_build: "whisperBuild",
  whisper_model: "whisperModel",
  google_cloud_api_key: "googleCloudApiKey",
  azure_subscription_key: "azureSubscriptionKey",
  azure_service_region: "azureServiceRegion",
  amazon_transcribe_region: "amazonTranscribeRegion",
  amazon_transcribe_access_key_id: "amazonTranscribeAccessKeyId",
  amazon_transcribe_secret_access_key: "amazonTranscribeSecretAccessKey",
  open_ai_api_key: "openAiApiKey",
  open_ai_organization: "openAiOrganization",
  open_ai_base_url: "openAiBaseUrl",
  open_ai_model_name: "openAiModelName",
} as const satisfies Record<string, keyof Settings>

export function getSetting<Name extends keyof typeof SETTINGS_COLUMN_NAMES>(
  name: Name,
) {
  const db = getDatabase()

  const { value: valueJson } = db
    .prepare<{ name: Name }>(
      `
    SELECT value
    FROM settings
    WHERE name = $name
    `,
    )
    .get({ name }) as { value: string }

  return JSON.parse(valueJson) as Settings[(typeof SETTINGS_COLUMN_NAMES)[Name]]
}

export function getSettings(): Settings {
  const db = getDatabase()

  const rows = db
    .prepare(
      `
    SELECT name, value
    FROM settings
    `,
    )
    .all() as {
    name: keyof typeof SETTINGS_COLUMN_NAMES
    value: string
  }[]

  const result = rows.reduce(
    (acc, row) => ({
      ...acc,
      [SETTINGS_COLUMN_NAMES[row.name]]: JSON.parse(row.value) as
        | string
        | number
        | boolean,
    }),
    {},
  ) as Settings

  return {
    ...result,
    smtpSsl: result.smtpSsl === true,
    smtpRejectUnauthorized: result.smtpRejectUnauthorized === true,
  }
}

export function updateSettings(settings: Required<Settings>) {
  const db = getDatabase()

  const statement = db.prepare<{ name: string; value: string }>(
    `
    UPDATE settings
    SET value = $value
    WHERE name = $name
    `,
  )

  Object.entries(SETTINGS_COLUMN_NAMES).forEach(
    ([columnName, propertyName]) => {
      if (!(propertyName in settings)) return

      statement.run({
        name: columnName,
        value: JSON.stringify(settings[propertyName]),
      })
    },
  )
}
