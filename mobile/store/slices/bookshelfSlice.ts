import { type PayloadAction, createSlice } from "@reduxjs/toolkit"
import {
  type PitchAlgorithm,
  type ResourceObject,
} from "react-native-track-player"

import { localApi } from "@/store/localApi"
import { type UUID } from "@/uuid"

export type BookshelfTrack = {
  bookUuid: UUID
  url: string | ResourceObject
  duration: number | undefined
  title: string
  album: string
  artist: string
  artwork: string | ResourceObject
  relativeUrl: string
  pitchAlgorithm: PitchAlgorithm
  mimeType: string
}

export type BookshelfState = {
  currentlyPlayingBookUuid: UUID | null
  currentlyPlayingFormat: "readaloud" | "ebook" | "audiobook" | null
  isAudioLoading: boolean
  sleepTimer: number | null | undefined
}

const initialState: BookshelfState = {
  currentlyPlayingBookUuid: null,
  currentlyPlayingFormat: null,
  isAudioLoading: false,
  sleepTimer: null,
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
    playerQueued(state) {
      state.isAudioLoading = false
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
        state.isAudioLoading = false
      }
    },
  },
  extraReducers: (builder) => {
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
        }
      },
    )
  },
})
