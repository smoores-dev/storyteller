import { type UUID } from "@/uuid"

import { db } from "./connection"

export type UserSettingValue = unknown

function parse(value: string | null): UserSettingValue {
  if (value === null) return null
  try {
    return JSON.parse(value) as UserSettingValue
  } catch {
    return value
  }
}

export async function getUserSettings(
  userId: UUID,
): Promise<Record<string, UserSettingValue>> {
  const rows = await db
    .selectFrom("userSettings")
    .select(["name", "value"])
    .where("userId", "=", userId)
    .execute()

  return rows.reduce<Record<string, UserSettingValue>>((acc, row) => {
    acc[row.name] = parse(row.value)
    return acc
  }, {})
}

export async function getUserSetting(
  userId: UUID,
  name: string,
): Promise<{ found: boolean; value: UserSettingValue }> {
  const row = await db
    .selectFrom("userSettings")
    .select(["value"])
    .where("userId", "=", userId)
    .where("name", "=", name)
    .executeTakeFirst()

  if (!row) {
    return { found: false, value: null }
  }

  return { found: true, value: parse(row.value) }
}

export async function setUserSetting(
  userId: UUID,
  name: string,
  value: UserSettingValue,
) {
  const serialised = value === null ? null : JSON.stringify(value)

  await db
    .insertInto("userSettings")
    .values({ userId, name, value: serialised })
    .onConflict((oc) =>
      oc.columns(["userId", "name"]).doUpdateSet({ value: serialised }),
    )
    .execute()
}

export async function updateUserSettings(
  userId: UUID,
  settings: Record<string, UserSettingValue>,
) {
  const existingSettings = await getUserSettings(userId)

  for (const [name, value] of Object.entries(settings)) {
    const unchanged =
      JSON.stringify(existingSettings[name]) === JSON.stringify(value)

    if (unchanged) continue

    await setUserSetting(userId, name, value)
  }
}

export async function deleteUserSetting(userId: UUID, name: string) {
  await db
    .deleteFrom("userSettings")
    .where("userId", "=", userId)
    .where("name", "=", name)
    .execute()
}
