import { getDatabase } from "./connection"

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
  codec?: string | null
  bitrate?: string | null
}

// Sqlite doesn't have real booleans; these are stored as bits
type SqliteSettings = Omit<Settings, "smtpSsl" | "smtpRejectUnauthorized"> & {
  smtpSsl: 0 | 1
  smtpRejectUnauthorized: 0 | 1
}

const SETTINGS_COLUMN_NAMES = {
  smtp_host: "smtpHost",
  smtp_port: "smtpPort",
  smtp_username: "smtpUsername",
  smtp_password: "smtpPassword",
  smtp_from: "smtpFrom",
  smtp_ssl: "smtpSsl",
  smtp_reject_unauthorized: "smtpRejectUnauthorized",
  library_name: "libraryName",
  web_url: "webUrl",
  codec: "codec",
  bitrate: "bitrate",
} as const

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
  ) as SqliteSettings

  return {
    ...result,
    smtpSsl: result.smtpSsl === 1,
    smtpRejectUnauthorized: result.smtpRejectUnauthorized === 1,
  }
}

export function updateSettings(settings: Settings) {
  const db = getDatabase()

  const statement = db.prepare<{ name: string; value: string }>(
    `
    UPDATE settings
    SET value = $value
    WHERE name = $name
    `,
  )

  statement.run({
    name: "smtp_from",
    value: JSON.stringify(settings.smtpFrom),
  })
  statement.run({
    name: "smtp_host",
    value: JSON.stringify(settings.smtpHost),
  })
  statement.run({
    name: "smtp_port",
    value: JSON.stringify(settings.smtpPort),
  })
  statement.run({
    name: "smtp_username",
    value: JSON.stringify(settings.smtpUsername),
  })
  statement.run({
    name: "smtp_password",
    value: JSON.stringify(settings.smtpPassword),
  })
  statement.run({
    name: "web_url",
    value: JSON.stringify(settings.webUrl),
  })
  statement.run({
    name: "library_name",
    value: JSON.stringify(settings.libraryName),
  })
  statement.run({
    name: "codec",
    value: JSON.stringify(settings.codec),
  })
  statement.run({
    name: "bitrate",
    value: JSON.stringify(settings.bitrate),
  })
}
