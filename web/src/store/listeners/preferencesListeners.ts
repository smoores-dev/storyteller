import { isAnyOf } from "@reduxjs/toolkit"

import { AudioPlayer } from "@/services/AudioPlayerService"

import { closeMiniPlayer } from "../actions"
import { getActiveFrame, getNavigator } from "../readerRegistry"
import {
  applyThemeToDocument,
  preferencesSlice,
  selectBookPreferences,
  selectEpubPreferences,
  storePreferencesInStorage,
} from "../slices/preferencesSlice"
import {
  readingSessionSlice,
  selectCurrentBook,
} from "../slices/readingSessionSlice"

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
    readingSessionSlice.actions.setActiveFrame,
  ),
  effect: async (_action, listenerApi) => {
    const target = selectCurrentBook(listenerApi.getState())?.uuid

    if (!target) return

    const preferences = selectBookPreferences(listenerApi.getState(), target)
    const activeFrame = getActiveFrame()
    // never apply themes if there's no active frame
    if (!activeFrame) return

    if (window.location.pathname.includes("/read")) {
      applyThemeToDocument(preferences)
    }

    try {
      if (activeFrame.iframe.contentWindow?.document) {
        applyThemeToDocument(
          preferences,
          activeFrame.iframe.contentWindow.document,
        )
      }

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
      await nav.submitPreferences(readiumPreferences)
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Trying to use frame when it doesn't exist")
      ) {
        console.warn(
          "Error when navigating to preferences, but it's not a problem",
          error,
        )
        return
      }
      throw error
    }
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
