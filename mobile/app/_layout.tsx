import { Slot, SplashScreen } from "expo-router"
import {
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
import { store } from "../store/store"
import { PlaybackService } from "../audio/PlaybackService"
import { StorytellerProvider } from "../components/StorytellerProvider"
import { useEffect } from "react"
import { AppState, AppStateStatus, Platform } from "react-native"
import { logger } from "../logger"
import "../tasks/backgroundFetchSyncPositions"
import { GestureHandlerRootView } from "react-native-gesture-handler"

TrackPlayer.registerPlaybackService(() => PlaybackService)

const PLAYER_OPTIONS = {
  capabilities: [
    ...(Platform.OS === "ios" ? [Capability.Bookmark] : []),
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

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from "expo-router"

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: "(tabs)",
}

SplashScreen.preventAutoHideAsync()

export default function Layout() {
  useEffect(() => {
    function onAppStateChange(status: AppStateStatus) {
      if (status === "active") {
        logger.debug("Foregrounded: updating progress interval to 3s")

        TrackPlayer.updateOptions({
          ...PLAYER_OPTIONS,
          progressUpdateEventInterval: 0.2,
        })
      } else {
        logger.debug("Backgrounded: updating progress interval to 30s")

        TrackPlayer.updateOptions({
          ...PLAYER_OPTIONS,
          progressUpdateEventInterval: 30,
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

  // console.log(usePathname())

  return (
    <GestureHandlerRootView>
      <Provider store={store}>
        <StorytellerProvider>
          <SafeAreaProvider initialMetrics={initialWindowMetrics}>
            <Slot />
          </SafeAreaProvider>
        </StorytellerProvider>
      </Provider>
    </GestureHandlerRootView>
  )
}
