import { DefaultTheme, ThemeProvider } from "@react-navigation/native"
import { SplashScreen, useRouter } from "expo-router"
import { type ReactNode, useEffect } from "react"

import { activeBackgroundColor } from "../design"
import { useColorTheme } from "../hooks/useColorTheme"
import { useAppSelector } from "../store/appState"
import { getStartupStatus } from "../store/selectors/startupSelectors"
import { StartupStatus } from "../store/slices/startupSlice"

export function StorytellerProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const startupStatus = useAppSelector(getStartupStatus)
  const { foreground, background, dark } = useColorTheme()

  useEffect(() => {
    if (
      startupStatus === StartupStatus.HYDRATED ||
      startupStatus === StartupStatus.IN_ERROR
    ) {
      SplashScreen.hideAsync()
    }
  }, [router, startupStatus])

  return (
    <ThemeProvider
      value={{
        ...DefaultTheme,
        dark,
        colors: {
          primary: foreground,
          background,
          card: background,
          text: foreground,
          border: activeBackgroundColor,
          notification: background,
        },
      }}
    >
      {startupStatus !== StartupStatus.HYDRATED &&
      startupStatus !== StartupStatus.IN_ERROR
        ? null
        : children}
    </ThemeProvider>
  )
}
