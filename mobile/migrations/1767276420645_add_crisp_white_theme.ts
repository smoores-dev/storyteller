import * as Device from "expo-device"
import { type Generated, type Kysely } from "kysely"

import { colors } from "@/components/ui/tokens/colors"
import { type ColorTheme } from "@/database/preferencesTypes"
import { type UUID } from "@/uuid"

const E_INK_MANUFACTURERS = ["onyx", "boox", "meebook"]

let newName = "Crisp White"

export async function up(db: Kysely<DB>): Promise<void> {
  await db.transaction().execute(async (tr) => {
    const oldThemesRow = await tr
      .selectFrom("preferences")
      .select("value")
      .where("name", "=", "colorThemes")
      .executeTakeFirst()
    if (!oldThemesRow) return
    const oldThemes = oldThemesRow.value as unknown as ColorTheme[]

    if (oldThemes.some((theme) => theme.name === "Crisp White")) {
      newName = "Crisp White (default)"
    }

    const newThemes = [
      ...oldThemes,
      {
        name: newName,
        foreground: colors.black,
        background: colors.white,
        isDark: false,
      },
    ]

    await tr
      .updateTable("preferences")
      .set({ value: JSON.stringify(newThemes) })
      .where("name", "=", "colorThemes")
      .execute()

    const isLikelyEInk = E_INK_MANUFACTURERS.some((m) =>
      Device.manufacturer?.toLowerCase().includes(m),
    )
    if (!isLikelyEInk) return

    const oldLightThemeRow = await tr
      .selectFrom("preferences")
      .select("value")
      .where("name", "=", "lightTheme")
      .executeTakeFirst()
    if (!oldLightThemeRow) return

    const oldLightTheme = JSON.parse(oldLightThemeRow.value) as string
    if (oldLightTheme !== "Day") return
    await tr
      .updateTable("preferences")
      .set({ value: JSON.stringify(newName) })
      .where("name", "=", "lightTheme")
      .execute()
  })
}

export async function down(db: Kysely<DB>): Promise<void> {
  await db.transaction().execute(async (tr) => {
    const oldThemesRow = await tr
      .selectFrom("preferences")
      .select("value")
      .where("name", "=", "colorThemes")
      .executeTakeFirst()
    if (!oldThemesRow) return
    const oldThemes = oldThemesRow.value as unknown as ColorTheme[]

    const newThemes = oldThemes.filter((theme) => theme.name !== newName)

    await tr
      .updateTable("preferences")
      .set({ value: JSON.stringify(newThemes) })
      .where("name", "=", "colorThemes")
      .execute()

    const oldLightThemeRow = await tr
      .selectFrom("preferences")
      .select("value")
      .where("name", "=", "lightTheme")
      .executeTakeFirst()
    if (!oldLightThemeRow) return

    const oldLightTheme = JSON.parse(oldLightThemeRow.value) as string
    if (oldLightTheme !== newName) return

    await tr
      .updateTable("preferences")
      .set({ value: JSON.stringify("Day") })
      .where("name", "=", "lightTheme")
      .execute()
  })
}

type PreferenceName =
  | "darkMode"
  | "showReaderUi"
  | "colorThemes"
  | "lightTheme"
  | "darkTheme"
  | "typography"
  | "layout"
  | "readaloudColor"
  | "customFonts"
  | "automaticRewind"
  | "hideStatusbar"

interface Preferences {
  createdAt: Generated<string>
  id: number | null
  name: PreferenceName
  updatedAt: Generated<string>
  uuid: UUID
  value: string
}

interface DB {
  preferences: Preferences
}
