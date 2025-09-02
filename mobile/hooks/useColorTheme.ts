import { useContext } from "react"
import { useColorScheme } from "react-native"

import { ThemeOverrideContext } from "../components/ThemeOverrideProvider"
import { useAppSelector } from "../store/appState"
import {
  getColorTheme,
  getDarkMode,
} from "../store/selectors/preferencesSelectors"

export function useColorTheme() {
  const colorScheme = useColorScheme()

  const darkModePreference = useAppSelector(getDarkMode)
  const overrides = useContext(ThemeOverrideContext)

  const darkMode =
    overrides?.dark ??
    (darkModePreference === true ||
      (darkModePreference === "auto" && colorScheme === "dark"))

  const theme = useAppSelector((state) => getColorTheme(state, darkMode))

  const foreground = overrides?.foreground ?? theme.foreground
  const background = overrides?.background ?? theme.background
  const surface = overrides?.surface ?? theme.surface
  const foregroundSecondary =
    overrides?.foregroundSecondary ?? theme.foregroundSecondary

  return {
    foreground,
    foregroundSecondary,
    background,
    surface,
    dark: darkMode,
  }
}
