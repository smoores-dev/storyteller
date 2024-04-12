import { getDatabase } from "./connection"

export type Settings = {
  smtpHost: string
  smtpPort: number
  smtpUsername: string
  smtpPassword: string
  smtpFrom: string
  libraryName: string
  webUrl: string
}

const SETTINGS_COLUMN_NAMES = {
  smtp_host: "smtpHost",
  smtp_port: "smtpPort",
  smtp_username: "smtpUsername",
  smtp_password: "smtpPassword",
  smtp_from: "smtpFrom",
  library_name: "libraryName",
  web_url: "webUrl",
} as const

export async function getSetting(name: string) {
  const db = await getDatabase()

  const { value: valueJson } = await db.get<{ value: string }>(
    `
    SELECT value
    FROM settings
    WHERE name = $name
    `,
    { $name: name },
  )

  return JSON.parse(valueJson)
}

export async function getSettings(): Promise<Settings> {
  const db = await getDatabase()

  const rows = await db.all<{
    name: keyof typeof SETTINGS_COLUMN_NAMES
    value: string
  }>(
    `
    SELECT name, value
    FROM settings
    `,
  )

  return rows.reduce(
    (acc, row) => ({
      ...acc,
      [SETTINGS_COLUMN_NAMES[row.name]]: JSON.parse(row.value),
    }),
    {},
  ) as Settings
}

export async function updateSettings(settings: Settings) {
  const db = await getDatabase()

  const statement = await db.prepare(
    `
    UPDATE settings
    SET value = $value
    WHERE name = $name
    `,
  )

  await Promise.all([
    statement.run({ $name: "smtp_from", $value: settings.smtpFrom }),
    statement.run({ $name: "smtp_host", $value: settings.smtpHost }),
    statement.run({ $name: "smtp_port", $value: settings.smtpPort }),
    statement.run({ $name: "smtp_username", $value: settings.smtpUsername }),
    statement.run({ $name: "smtp_password", $value: settings.smtpPassword }),
    statement.run({ $name: "web_url", $value: settings.webUrl }),
    statement.run({ $name: "library_name", $value: settings.libraryName }),
  ])
}
