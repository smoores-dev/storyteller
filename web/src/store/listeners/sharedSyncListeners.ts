// listeners that mostly dispatch other listeners

import { type Locator } from "@readium/shared"
import { isAnyOf } from "@reduxjs/toolkit"

import { getApiUrlFromResourceHref } from "@/components/reader/BookService"
import { AudioPlayer } from "@/services/AudioPlayerService"

import {
  type SkipPartButtonPayload,
  navItemPressed,
  skipPartButtonHeld,
  skipPartButtonPressed,
  userRequestedTextNavigation,
} from "../actions"
import {
  selectCurrentBook,
  selectCurrentLocator,
  selectCurrentToCLocator,
  selectReadingMode,
} from "../slices/readingSessionSlice"

import { handleChapterSkip, handleFragmentSkip } from "./helpers"
import { startAppListening } from "./listenerMiddleware"

// shared locators
const matchSharedLocators = isAnyOf(navItemPressed)

startAppListening({
  matcher: matchSharedLocators,
  effect: async (action, listenerApi) => {
    const mode = selectReadingMode(listenerApi.getState())
    const currentBook = selectCurrentBook(listenerApi.getState())
    if (!currentBook) return

    if (mode === "audiobook") {
      const currentTrackIndex = AudioPlayer.getQueue().findIndex(
        (track) =>
          track.url ===
          getApiUrlFromResourceHref(
            currentBook.uuid,
            action.payload.locator.href,
            "listen",
          ),
      )

      const time = action.payload.locator.locations.fragments[0]?.split("=")[1]
      const position = time ? parseFloat(time) : 0
      await AudioPlayer.skip(currentTrackIndex, position)
      return
    }

    AudioPlayer.pause()
    listenerApi.dispatch(
      userRequestedTextNavigation({ locator: action.payload.locator }),
    )
    return
  },
})

// handle skip buttons (press = short skip, hold = chapter/track skip)
startAppListening({
  matcher: isAnyOf(skipPartButtonPressed, skipPartButtonHeld),
  effect: async (action, listenerApi) => {
    const mode = selectReadingMode(listenerApi.getState())
    const currentTocItem = selectCurrentToCLocator(listenerApi.getState())
    const { direction, context } = action["payload"] as SkipPartButtonPayload

    const isPressed = action.type === skipPartButtonPressed.type
    const isHeld = action.type === skipPartButtonHeld.type

    // in miniplayer or audiobook modes, buttons control audio directly
    if (context === "miniplayer" || mode === "audiobook") {
      if (isPressed) {
        const seekAmount = direction === "next" ? 15 : -15
        AudioPlayer.seekBy(seekAmount)
        return
      }

      if (isHeld) {
        if (direction === "next") {
          await AudioPlayer.skipToNext()
        } else {
          await AudioPlayer.skipToPrevious()
        }
        return
      }
    }

    // in readaloud mode, buttons navigate text (audio follows via sync)
    const currentLocator = selectCurrentLocator(listenerApi.getState())
    const requestTextNavigation = (locator: Locator) => {
      listenerApi.dispatch(userRequestedTextNavigation({ locator }))
    }
    if (isPressed) {
      await handleFragmentSkip(direction, currentLocator, requestTextNavigation)
      return
    }

    if (isHeld) {
      handleChapterSkip(
        direction,
        currentTocItem ?? null,
        requestTextNavigation,
      )
      return
    }
  },
})
