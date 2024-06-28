import { useColorScheme } from "react-native"
import { useAppSelector } from "../store/appState"
import {
  getColorTheme,
  getDarkMode,
} from "../store/selectors/preferencesSelectors"
import { useContext } from "react"
import { ThemeOverrideContext } from "../components/ThemeOverrideProvider"

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

  return { foreground, background, dark: darkMode }
}
