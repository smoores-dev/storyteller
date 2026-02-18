import { createSelector } from "@reduxjs/toolkit"

import { type RootState } from "@/store/appState"
import { localApi } from "@/store/localApi"

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

export function getIsPlaying(state: RootState) {
  return state.bookshelf.isPlaying
}

export function getCurrentTrack(state: RootState) {
  return state.bookshelf.currentTrack
}

export function getPosition(state: RootState) {
  return state.bookshelf.position
}

export function getTracks(state: RootState) {
  return state.bookshelf.tracks
}

export const getCurrentTrackIndex = createSelector(
  (state: RootState) => state.bookshelf.currentTrack,
  (state: RootState) => state.bookshelf.tracks,
  (currentTrack, tracks) => {
    if (!currentTrack) return 0
    return tracks.findIndex(
      (track) => track.relativeUri === currentTrack.relativeUri,
    )
  },
)

export function formatTime(time: number, rate = 1) {
  time = time / rate
  const hours = Math.floor(time / 3600)
  const minutes = Math.floor(time / 60 - hours * 60)
  const seconds = Math.floor(time - hours * 3600 - minutes * 60)
    .toString()
    .padStart(2, "0")
  if (hours) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds}`
  }
  return `${minutes}:${seconds}`
}

export function formatTimeHuman(time: number, rate = 1) {
  time = time / rate
  const hours = Math.floor(time / 3600)
  const minutes = Math.floor(time / 60 - hours * 60)

  if (hours) {
    return `${hours} hr ${minutes} min`
  }
  return `${minutes} min`
}

export function getPlaybackRate(state: RootState) {
  const bookUuid = getCurrentlyPlayingBookUuid(state)
  if (!bookUuid) return 1
  const preferences = localApi.endpoints.getBookPreferences.select({
    uuid: bookUuid,
  })(state)
  return preferences.data?.audio?.speed ?? 1
}

export const getFormattedPosition = createSelector(
  getPosition,
  getPlaybackRate,
  formatTime,
)

export const getFormattedDuration = createSelector(
  getCurrentTrack,
  getPlaybackRate,
  (track, rate) => {
    if (!track) return 0
    return formatTime(track.duration, rate)
  },
)

export function getTrackCount(state: RootState) {
  return state.bookshelf.tracks.length
}

export function getCurrentTrackDuration(state: RootState) {
  return getCurrentTrack(state)?.duration ?? 0
}

export const getBookDuration = createSelector(getTracks, (tracks) => {
  return tracks.reduce((acc, track) => acc + (track.duration ?? 0), 0)
})

export function getBookPosition(state: RootState) {
  return getBookDuration(state) - getRemainingTime(state)
}

export const getRemainingTime = createSelector(
  getCurrentTrackIndex,
  getCurrentTrack,
  getTracks,
  getPosition,
  (currentTrackIndex, currentTrack, tracks, position) => {
    if (!currentTrack) return 0

    const remainingTracks = tracks.slice(currentTrackIndex + 1)
    return (
      remainingTracks.reduce((acc, track) => acc + track.duration, 0) +
      currentTrack.duration -
      position
    )
  },
)

export const getFormattedBookDuration = createSelector(
  getBookDuration,
  getPlaybackRate,
  formatTime,
)

export const getFormattedRemainingTime = createSelector(
  getRemainingTime,
  getPlaybackRate,
  formatTime,
)

export const getHumanFormattedRemainingTime = createSelector(
  getRemainingTime,
  getPlaybackRate,
  formatTimeHuman,
)

export const getPercentComplete = createSelector(
  getRemainingTime,
  getBookDuration,
  (remaining, total) => {
    return Math.round(((total - remaining) / total) * 100)
  },
)
