import { Slot, SplashScreen } from "expo-router"
import { useEffect } from "react"
import { AppState, type AppStateStatus } from "react-native"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { KeyboardProvider } from "react-native-keyboard-controller"
import {
  SafeAreaListener,
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context"
import TrackPlayer, {
  AndroidAudioContentType,
  Capability,
  IOSCategory,
  IOSCategoryMode,
} from "react-native-track-player"
import { Provider } from "react-redux"
import { Uniwind } from "uniwind"

import { PlaybackService } from "@/audio/PlaybackService"
import { StorytellerProvider } from "@/components/StorytellerProvider"
import { PortalHost } from "@/components/ui/portal-context"
import "@/global.css"
import { AudioBookProvider } from "@/hooks/useAudioBook"
import { logger } from "@/logger"
import { store } from "@/store/store"

TrackPlayer.registerPlaybackService(() => PlaybackService)

const PLAYER_OPTIONS = {
  capabilities: [
    Capability.JumpBackward,
    Capability.JumpForward,
    Capability.Pause,
    Capability.Play,
  ],
  forwardJumpInterval: 15,
  backwardJumpInterval: 15,
}

async function initializePlayer() {
  try {
    await TrackPlayer.setupPlayer({
      autoHandleInterruptions: true,
      iosCategory: IOSCategory.Playback,
      iosCategoryMode: IOSCategoryMode.SpokenAudio,
      androidAudioContentType: AndroidAudioContentType.Speech,
    })

    await TrackPlayer.updateOptions({
      ...PLAYER_OPTIONS,
      progressUpdateEventInterval: 0.2,
    })
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "The player has already been initialized via setupPlayer."
    ) {
      return
    }
    throw error
  }
}

initializePlayer()

export { ErrorBoundary } from "expo-router"

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: "index",
}

SplashScreen.preventAutoHideAsync()

export default function Layout() {
  useEffect(() => {
    function onAppStateChange(status: AppStateStatus) {
      if (status === "active") {
        logger.debug("Foregrounded: updating progress interval to 0.2s")

        TrackPlayer.updateOptions({
          ...PLAYER_OPTIONS,
          progressUpdateEventInterval: 0.2,
        })
      } else {
        const { sleepTimer } = store.getState().bookshelf
        const interval = sleepTimer ? 5 : 30

        logger.debug(`Backgrounded: updating progress interval to ${interval}s`)

        TrackPlayer.updateOptions({
          ...PLAYER_OPTIONS,
          progressUpdateEventInterval: interval,
        })
      }
    }

    try {
      const subscription = AppState.addEventListener("change", onAppStateChange)

      return () => {
        subscription.remove()
      }
    } catch (error) {
      logger.error(error)
    }

    return
  }, [])

  return (
    <GestureHandlerRootView>
      <KeyboardProvider>
        <Provider store={store}>
          <AudioBookProvider>
            <StorytellerProvider>
              <SafeAreaProvider initialMetrics={initialWindowMetrics}>
                <SafeAreaListener
                  onChange={({ insets }) => {
                    Uniwind.updateInsets(insets)
                  }}
                >
                  <PortalHost>
                    <Slot />
                  </PortalHost>
                </SafeAreaListener>
              </SafeAreaProvider>
            </StorytellerProvider>
          </AudioBookProvider>
        </Provider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  )
}
