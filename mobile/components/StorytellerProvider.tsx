import { ReactNode, useEffect } from "react"
import { getStartupStatus } from "../store/selectors/startupSelectors"
import { StartupStatus } from "../store/slices/startupSlice"
import { SplashScreen, useRouter } from "expo-router"
import { useAppSelector } from "../store/appState"

export function StorytellerProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const startupStatus = useAppSelector(getStartupStatus)

  useEffect(() => {
    if (
      startupStatus === StartupStatus.HYDRATED ||
      startupStatus === StartupStatus.IN_ERROR
    ) {
      SplashScreen.hideAsync()
    }
  }, [router, startupStatus])

  return startupStatus !== StartupStatus.HYDRATED &&
    startupStatus !== StartupStatus.IN_ERROR
    ? null
    : children
}
