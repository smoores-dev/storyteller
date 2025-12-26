import { type SkipToken } from "@reduxjs/toolkit/query"
import { useContext } from "react"
import { useColorScheme } from "react-native"

import { ThemeOverrideContext } from "@/components/ThemeOverrideProvider"
import { defaultPreferences } from "@/database/preferencesTypes"
import { useGetGlobalPreferencesQuery } from "@/store/localApi"

export function useColorTheme(skipToken?: SkipToken) {
  const colorScheme = useColorScheme()

  const { data: preferences } = useGetGlobalPreferencesQuery(skipToken)
  const darkModePreference = preferences?.darkMode ?? "auto"
  const overrides = useContext(ThemeOverrideContext)

  const darkMode =
    overrides?.dark ??
    (darkModePreference === true ||
      (darkModePreference === "auto" && colorScheme === "dark"))

  const themeName = darkMode ? preferences?.darkTheme : preferences?.lightTheme
  const theme =
    preferences?.colorThemes.find((theme) => theme.name === themeName) ??
    defaultPreferences.colorThemes.find((theme) => theme.isDark === darkMode)!

  const foreground = overrides?.foreground ?? theme.foreground
  const background = overrides?.background ?? theme.background

  return {
    foreground,
    background,
    dark: darkMode,
  }
}
