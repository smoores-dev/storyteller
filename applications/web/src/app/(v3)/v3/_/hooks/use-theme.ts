import { useTheme as useNextTheme } from "next-themes"

import { useAppDispatch, useAppSelector } from "@/store/appState"
import { selectTheme, uiSettingsSlice } from "@/store/slices/uiSettingsSlice"

export function useTheme() {
  const theme = useAppSelector(selectTheme)
  const { setTheme: setNextTheme, theme: _, ...rest } = useNextTheme()
  const dispatch = useAppDispatch()

  const setTheme = (theme: "light" | "dark" | "system") => {
    dispatch(uiSettingsSlice.actions.setTheme(theme))
    setNextTheme(theme)
  }

  return { theme, setTheme, ...rest }
}
