import { db } from "./db"
import { type Preferences } from "./preferencesTypes"

export async function getPreferences(): Promise<Preferences> {
  const rows = await db
    .selectFrom("preferences")
    .select(["name", "value"])
    .execute()

  return rows.reduce(
    (acc, row) => ({
      ...acc,
      [row.name]:
        // We configured Kysely to auto-parse JSON objects and arrays,
        // so we need to guard against values that have already been parsed
        typeof row.value === "string"
          ? (JSON.parse(row.value) as Preferences[keyof Preferences])
          : row.value,
    }),
    {} as Preferences,
  )
}

export async function getPreference<Name extends keyof Preferences>(
  name: Name,
): Promise<Preferences[Name]> {
  const { value } = await db
    .selectFrom("preferences")
    .select("value")
    .where("name", "=", name)
    .executeTakeFirstOrThrow()

  // We configured Kysely to auto-parse JSON objects and arrays,
  // so we need to guard against values that have already been parsed
  return typeof value === "string"
    ? (JSON.parse(value) as Preferences[Name])
    : value
}

export async function updatePreference(
  name: keyof Preferences,
  value: Preferences[keyof Preferences],
) {
  await db
    .updateTable("preferences")
    .set({ value: JSON.stringify(value) })
    .where("name", "=", name)
    .execute()
}

export async function updatePreferences(preferences: Partial<Preferences>) {
  await db.transaction().execute(async (tr) => {
    for (const [name, value] of Object.entries(preferences)) {
      await tr
        .updateTable("preferences")
        .set({ value: JSON.stringify(value) })
        .where("name", "=", name as keyof Preferences)
        .execute()
    }
  })
}
