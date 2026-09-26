import * as Sentry from "@sentry/react-native"
import { ExpoKeepAwakeTag, deactivateKeepAwake } from "expo-keep-awake"
import { Slot, SplashScreen } from "expo-router"
import { useEffect } from "react"
import { AppState } from "react-native"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { KeyboardProvider } from "react-native-keyboard-controller"
import {
  SafeAreaListener,
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context"
import { Provider } from "react-redux"
import { Uniwind } from "uniwind"

import { BookTransferFeedback } from "@/components/BookTransferFeedback"
import { StorytellerProvider } from "@/components/StorytellerProvider"
import { PortalHost } from "@/components/ui/portal-context"
import "@/global.css"
import { logger } from "@/logger"
import { store } from "@/store/store"
import { registerBackgroundTaskAsync } from "@/tasks/backgroundTaskSyncPositions"

// NOTE: Sentry is _only_ enabled for debug builds used to track down
// specific crash errors. It is _not_ included in the public Storyteller
// releases (either in the app stores or on GitLab's release page).
if (process.env["EXPO_PUBLIC_ENABLE_SENTRY"]) {
  logger.info("Sentry-enabled build. Connecting to Sentry.")
  Sentry.init({
    dsn: "https://bdd60fe132e39c7c0db8a06f40867b4a@o4510799972204544.ingest.us.sentry.io/4510799975284736",
    // Adds more context data to events (IP address, cookies, user, etc.)
    // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
    sendDefaultPii: true,
  })
}

export { ErrorBoundary } from "expo-router"

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: "index",
}

registerBackgroundTaskAsync()

SplashScreen.preventAutoHideAsync()

function DisableExpoDevKeepAwake() {
  useEffect(() => {
    if (!__DEV__) return

    let timeout: ReturnType<typeof setTimeout> | null = null

    const deactivate = () => {
      if (timeout) {
        clearTimeout(timeout)
      }

      timeout = setTimeout(() => {
        void deactivateKeepAwake(ExpoKeepAwakeTag)
      }, 0)
    }

    deactivate()

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        deactivate()
      }
    })

    return () => {
      if (timeout) {
        clearTimeout(timeout)
      }
      subscription.remove()
    }
  }, [])

  return null
}

function Layout() {
  return (
    <GestureHandlerRootView>
      {/* Flip false to true to suppress expo dev-client's built-in keep awake
          in order to test sleep timers */}
      {false && <DisableExpoDevKeepAwake />}
      <KeyboardProvider>
        <Provider store={store}>
          <StorytellerProvider>
            <SafeAreaProvider initialMetrics={initialWindowMetrics}>
              <SafeAreaListener
                onChange={({ insets }) => {
                  Uniwind.updateInsets(insets)
                }}
              >
                <PortalHost>
                  <Slot />
                  <BookTransferFeedback />
                </PortalHost>
              </SafeAreaListener>
            </SafeAreaProvider>
          </StorytellerProvider>
        </Provider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  )
}

const WrappedLayout = process.env["ENABLE_SENTRY"]
  ? Sentry.wrap(Layout)
  : Layout

export default WrappedLayout
