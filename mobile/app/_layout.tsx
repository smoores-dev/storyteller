import { Slot, SplashScreen } from "expo-router"
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context"
import TrackPlayer, {
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

TrackPlayer.registerPlaybackService(() => PlaybackService)

const PLAYER_OPTIONS = {
  alwaysPauseOnInterruption: true,
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
      iosCategory: IOSCategory.Playback,
      iosCategoryMode: IOSCategoryMode.SpokenAudio,
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

  return (
    <Provider store={store}>
      <StorytellerProvider>
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
          <Slot />
        </SafeAreaProvider>
      </StorytellerProvider>
    </Provider>
  )
}
