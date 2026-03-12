import { isAnyOf } from "@reduxjs/toolkit"

import { withActiveFrame } from "@/components/reader/frameUtils"
import { AudioPlayer } from "@/services/AudioPlayerService"
import { closeMiniPlayer } from "@/store/actions"
import { getNavigator } from "@/store/readerRegistry"
import {
  applyThemeToDocument,
  preferencesSlice,
  selectBookPreferences,
  selectEpubPreferences,
  storePreferencesInStorage,
  syncAutoTheme,
} from "@/store/slices/preferencesSlice"
import {
  readingSessionSlice,
  selectCurrentBook,
} from "@/store/slices/readingSessionSlice"

import { startAppListening } from "./listenerMiddleware"

startAppListening({
  matcher: isAnyOf(
    preferencesSlice.actions.updatePreference,
    preferencesSlice.actions.resetPreference,
    preferencesSlice.actions.incrementPlaybackRate,
    preferencesSlice.actions.toggleBookDetailView,
  ),
  effect: (_action, listenerApi) => {
    if (typeof window === "undefined") return

    const preferences = listenerApi.getState().preferences

    try {
      storePreferencesInStorage(preferences)
    } catch (error) {
      console.error("failed to save preferences to localStorage:", error)
    }
  },
})

startAppListening({
  matcher: isAnyOf(
    preferencesSlice.actions.updatePreference,
    preferencesSlice.actions.resetPreference,
    syncAutoTheme,
    readingSessionSlice.actions.setActiveFrame,
  ),
  effect: async (_action, listenerApi) => {
    const target = selectCurrentBook(listenerApi.getState())?.uuid
    if (!target) return

    const preferences = selectBookPreferences(listenerApi.getState(), target)

    if (window.location.pathname.includes("/read")) {
      applyThemeToDocument(preferences)
    }

    // apply theme to iframe, returns null if frame unavailable
    const applied = withActiveFrame((frame) => {
      applyThemeToDocument(preferences, frame.iframe.contentWindow.document)
      return true
    })

    // don't continue if no active frame
    if (!applied) return

    if (window.documentPictureInPicture?.window) {
      applyThemeToDocument(
        preferences,
        window.documentPictureInPicture.window.document,
      )
    }

    const nav = getNavigator()
    if (!nav) return

    const readiumPreferences = selectEpubPreferences(
      listenerApi.getState(),
      target,
    )

    await withActiveFrame(async () => {
      await nav.submitPreferences(readiumPreferences)
    })
  },
})

startAppListening({
  matcher: isAnyOf(closeMiniPlayer),
  effect: async (_action, listenerApi) => {
    listenerApi.dispatch(
      preferencesSlice.actions.updatePreference({
        key: "currentlyListeningBookId",
        value: null,
        target: "global",
      }),
    )
    listenerApi.dispatch(readingSessionSlice.actions.closeBook())
    AudioPlayer.pause()
    await AudioPlayer.replacePlaylist([])
  },
})
