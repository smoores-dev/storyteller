import { createSelector } from "@reduxjs/toolkit"

import { type RootState } from "@/store/appState"

export function getCurrentlyPlayingBookUuid(state: RootState) {
  return state.bookshelf.currentlyPlayingBookUuid
}

export function getCurrentlyPlayingFormat(state: RootState) {
  return state.bookshelf.currentlyPlayingFormat
}

export function getIsAudioLoading(state: RootState) {
  return state.bookshelf.isAudioLoading
}

/**
 * Get sleep timer as a memoized Date object.
 */
export const getSleepTimer = createSelector(
  (state: RootState) => state.bookshelf.sleepTimer,
  (sleepTimer) => {
    return sleepTimer ? new Date(sleepTimer) : null
  },
)
