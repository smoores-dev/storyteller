import { EpubPreferences } from "@readium/navigator"
import { isAnyOf } from "@reduxjs/toolkit"

import { withActiveFrame } from "@/components/reader/frameUtils"
import { readerPlayer } from "@/services/AudioPlayerService"
import { closeMiniPlayer } from "@/store/actions"
import { getNavigator } from "@/store/readerRegistry"
import {
  applyFrameTheme,
  applyReaderTheme,
  clearPerBookPreferencesInStorage,
  preferencesSlice,
  readReaderTokens,
  readiumIfyPreferences,
  selectBookPreferences,
  storePreferencesInStorage,
} from "@/store/slices/preferencesSlice"
import {
  readingSessionSlice,
  selectCurrentBook,
  selectCurrentLocator,
  selectCurrentlyHighlightedFragment,
} from "@/store/slices/readingSessionSlice"

import { highlightFragment } from "./helpers"
import { startAppListening } from "./listenerMiddleware"

const HIGHLIGHT_APPEARANCE_KEYS = new Set([
  "highlightStyle",
  "highlightColor",
  "customHighlightColor",
  "theme",
])

startAppListening({
  matcher: isAnyOf(
    preferencesSlice.actions.updatePreference,
    preferencesSlice.actions.resetPreference,
    preferencesSlice.actions.incrementPlaybackRate,
    preferencesSlice.actions.toggleBookDetailView,
    preferencesSlice.actions.applyBookPreferencesToAllBooks,
  ),
  effect: (action, listenerApi) => {
    if (typeof window === "undefined") return

    const preferences = listenerApi.getState().preferences

    try {
      if (
        preferencesSlice.actions.applyBookPreferencesToAllBooks.match(action)
      ) {
        clearPerBookPreferencesInStorage()
      }
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
    preferencesSlice.actions.initBookPreferences,
    readingSessionSlice.actions.startBook,
    readingSessionSlice.actions.setActiveFrame,
  ),
  effect: async (action, listenerApi) => {
    const book = selectCurrentBook(listenerApi.getState())
    if (!book) return

    const preferences = selectBookPreferences(listenerApi.getState(), book.uuid)

    if (
      window.location.pathname.includes("/read") ||
      window.location.pathname.includes("/book")
    ) {
      applyReaderTheme(preferences, book)
    }

    if (window.documentPictureInPicture?.window) {
      applyReaderTheme(
        preferences,
        book,
        window.documentPictureInPicture.window.document,
      )
    }

    const tokens = readReaderTokens()

    const applied = withActiveFrame((frame) => {
      applyFrameTheme(preferences, tokens, frame.iframe.contentWindow.document)
      return true
    })

    if (!applied) return

    const appearanceChanged =
      (preferencesSlice.actions.updatePreference.match(action) ||
        preferencesSlice.actions.resetPreference.match(action)) &&
      HIGHLIGHT_APPEARANCE_KEYS.has(action.payload.key)

    const highlighted = selectCurrentlyHighlightedFragment(
      listenerApi.getState(),
    )
    const locator = selectCurrentLocator(listenerApi.getState())

    if (appearanceChanged && highlighted && locator) {
      withActiveFrame((frame) => {
        highlightFragment(frame, locator, preferences)
      })
    }

    const nav = getNavigator()
    if (!nav) return

    await withActiveFrame(async () => {
      await nav.submitPreferences(
        new EpubPreferences(readiumIfyPreferences(preferences, tokens)),
      )
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
    readerPlayer().pause()
    await readerPlayer().replacePlaylist([])
  },
})
