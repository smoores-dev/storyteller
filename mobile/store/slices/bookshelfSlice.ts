import { type PayloadAction, createSlice } from "@reduxjs/toolkit"
import { isPast } from "date-fns"

import { logger } from "@/logger"
import { type StorytellerTrack } from "@/modules/readium/src/Readium.types"
import { localApi } from "@/store/localApi"
import { type UUID } from "@/uuid"

export type BookshelfState = {
  currentlyPlayingBookUuid: UUID | null
  currentlyPlayingFormat: "readaloud" | "ebook" | "audiobook" | null
  isAudioLoading: boolean
  sleepTimer: number | null | undefined
  tracks: StorytellerTrack[]
  position: number
  isPlaying: boolean
  currentTrack: StorytellerTrack | null
  currentTrackIndex: number
}

const initialState: BookshelfState = {
  currentlyPlayingBookUuid: null,
  currentlyPlayingFormat: null,
  isAudioLoading: false,
  sleepTimer: null,
  tracks: [],
  position: 0,
  isPlaying: false,
  currentTrack: null,
  currentTrackIndex: 0,
}

export const bookshelfSlice = createSlice({
  name: "bookshelf",
  initialState,
  reducers: {
    bookOpened(
      state,
      action: PayloadAction<{
        bookUuid: UUID
        format: "readaloud" | "ebook" | "audiobook"
      }>,
    ) {
      const { bookUuid, format } = action.payload

      state.isAudioLoading = state.currentlyPlayingBookUuid !== bookUuid
      state.currentlyPlayingBookUuid = bookUuid
      state.currentlyPlayingFormat = format
    },
    playerQueued(state, action: PayloadAction<{ tracks: StorytellerTrack[] }>) {
      state.isAudioLoading = false
      state.tracks = action.payload.tracks
    },
    audioPositionChanged(state, action: PayloadAction<{ position: number }>) {
      state.position = action.payload.position
    },
    audioTrackChanged(
      state,
      action: PayloadAction<{
        track: StorytellerTrack
        position: number
        index: number
      }>,
    ) {
      const trackFromState = state.tracks[action.payload.index]
      if (!trackFromState) {
        logger.debug(
          `audioTrackChanged: index ${action.payload.index} out of bounds (${state.tracks.length} tracks)`,
        )
      }
      state.currentTrack = trackFromState ?? action.payload.track
      state.position = action.payload.position
      state.currentTrackIndex = action.payload.index
    },
    isPlayingChanged(state, action: PayloadAction<{ isPlaying: boolean }>) {
      state.isPlaying = action.payload.isPlaying
    },
    sleepTimerSet: (
      state,
      action: PayloadAction<{ sleepTimer: Date | null }>,
    ) => {
      state.sleepTimer = action.payload.sleepTimer?.getTime()
    },
    sleepTimerExpired: (state) => {
      state.sleepTimer = null
    },
    bookDeleted(state, action: PayloadAction<{ bookUuid: UUID }>) {
      const { bookUuid } = action.payload

      if (state.currentlyPlayingBookUuid === bookUuid) {
        state.currentlyPlayingBookUuid = null
        state.currentlyPlayingFormat = null
        state.isAudioLoading = false
        state.tracks = []
        state.position = 0
        state.isPlaying = false
        state.currentTrack = null
        state.currentTrackIndex = 0
      }
    },
    miniPlayerWidgetSwiped(state) {
      state.isAudioLoading = false
      state.tracks = []
      state.position = 0
      state.isPlaying = false
      state.currentlyPlayingBookUuid = null
      state.currentlyPlayingFormat = null
      state.currentTrack = null
      state.currentTrackIndex = 0
    },
  },
  extraReducers: (builder) => {
    builder.addCase(
      bookshelfSlice.actions.isPlayingChanged,
      (state, action) => {
        if (!action.payload.isPlaying) return
        const sleepTimer = state.sleepTimer
        if (sleepTimer && isPast(sleepTimer)) {
          state.sleepTimer = null
        }
      },
    )
    builder.addMatcher(
      localApi.endpoints.deleteBook.matchFulfilled,
      (state, action) => {
        if (
          state.currentlyPlayingBookUuid ===
          action.meta.arg.originalArgs.bookUuid
        ) {
          state.isAudioLoading = false
          state.currentlyPlayingBookUuid = null
          state.currentlyPlayingFormat = null
          state.tracks = []
          state.position = 0
          state.isPlaying = false
          state.currentTrack = null
          state.currentTrackIndex = 0
        }
      },
    )
  },
})
