import { ReactNode, useEffect } from "react"
import { ThemeProvider } from "@react-navigation/native"
import { getStartupStatus } from "../store/selectors/startupSelectors"
import { StartupStatus } from "../store/slices/startupSlice"
import { SplashScreen, useRouter } from "expo-router"
import { useAppSelector } from "../store/appState"
import { useColorTheme } from "../hooks/useColorTheme"
import { activeBackgroundColor } from "../design"

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
