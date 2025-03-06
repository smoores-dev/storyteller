import AsyncStorage from "@react-native-async-storage/async-storage"
import {
  PreferencesState,
  BookPreferences,
  defaultPreferences,
} from "../slices/preferencesSlice"
import {
  computeForegroundSecondary,
  computeSurface,
} from "../../components/ui/tokens/colors"

export async function readGlobalPreferences(): Promise<null | Omit<
  PreferencesState,
  "bookPreferences"
>> {
  const stored = await AsyncStorage.getItem("preferences")
  if (!stored) return null

  const preferences = JSON.parse(stored) as Omit<
    PreferencesState,
    "bookPreferences"
  >

  // Ensure that new default themes get added to user preferences
  defaultPreferences.colorThemes.forEach((theme) => {
    const existingTheme = preferences.colorThemes.find(
      (t) => t.name === theme.name,
    )
    if (existingTheme) {
      existingTheme.background = theme.background
      existingTheme.foreground = theme.foreground
      existingTheme.isDark = theme.isDark
      existingTheme.surface = theme.surface
      existingTheme.foregroundSecondary = theme.foregroundSecondary
      return
    }

    preferences.colorThemes.push(theme)
  })

  // Ensure that new fields are on existing
  // user themes
  preferences.colorThemes.forEach((theme) => {
    theme.surface = computeSurface(theme.foreground, theme.background)
    theme.foregroundSecondary = computeForegroundSecondary(
      theme.foreground,
      theme.background,
    )
  })

  return preferences
}

export async function writeGlobalPreferences(
  preferences: Omit<PreferencesState, "bookPreferences">,
) {
  return AsyncStorage.setItem("preferences", JSON.stringify(preferences))
}

export async function readBookPreferences(
  bookId: number,
): Promise<null | BookPreferences> {
  const stored = await AsyncStorage.getItem(`preferences.${bookId}`)
  if (!stored) return null

  return JSON.parse(stored)
}

export async function writeBookPreferences(
  bookId: number,
  preferences: BookPreferences,
) {
  return AsyncStorage.setItem(
    `preferences.${bookId}`,
    JSON.stringify(preferences),
  )
}

export async function deleteBookPreferences(bookId: number) {
  return AsyncStorage.removeItem(`preferences.${bookId}`)
}
