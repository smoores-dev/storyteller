import { useColorScheme } from "react-native"
import { useAppSelector } from "../store/appState"
import { getPreferences } from "../store/selectors/preferencesSelectors"

export function useColorTheme() {
  const colorScheme = useColorScheme()

  const preferences = useAppSelector(getPreferences)

  const darkMode =
    preferences.darkMode === true ||
    (preferences.darkMode === "auto" && colorScheme === "dark")

  const foreground = darkMode === true ? "#FFFFFF" : "#000000"
  const background = darkMode === true ? "#000000" : "#FFFFFF"

  return { foreground, background, dark: darkMode }
}
