import { type PayloadAction, createSlice, isAnyOf } from "@reduxjs/toolkit"

import { logger } from "@/logger"
import {
  type ReadiumLocator,
  type StorytellerTrack,
} from "@/modules/readium/src/Readium.types"
import {
  bookmarkPressed,
  clearReturnPosition,
  navItemPressed,
  returnToPreviousPosition,
} from "@/store/actions"
import { localApi } from "@/store/localApi"
import { type UUID } from "@/uuid"

export type ReturnToPosition = {
  locator: ReadiumLocator
}

export type BookshelfState = {
  currentlyPlayingBookUuid: UUID | null
  currentlyPlayingFormat: "readaloud" | "ebook" | "audiobook" | null
  playbackSpeedContext: "listening" | "reading"
  isAudioLoading: boolean
  tracks: StorytellerTrack[]
  position: number
  isPlaying: boolean
  currentTrack: StorytellerTrack | null
  currentTrackIndex: number
  currentSearchQuery: string | null
  returnToPositions: Record<UUID, ReturnToPosition>
  footnoteContent: string | null
}

const initialState: BookshelfState = {
  currentlyPlayingBookUuid: null,
  currentlyPlayingFormat: null,
  playbackSpeedContext: "listening",
  isAudioLoading: false,
  tracks: [],
  position: 0,
  isPlaying: false,
  currentTrack: null,
  currentTrackIndex: 0,
  currentSearchQuery: null,
  returnToPositions: {},
  footnoteContent: null,
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

      const openingSameBookFormat =
        state.currentlyPlayingBookUuid === bookUuid &&
        state.currentlyPlayingFormat === format

      state.isAudioLoading = !openingSameBookFormat
      state.currentlyPlayingBookUuid = bookUuid
      state.currentlyPlayingFormat = format

      if (!openingSameBookFormat) {
        state.tracks = []
        state.position = 0
        state.currentTrack = null
        state.currentTrackIndex = 0
      }
    },
    playerQueued(state, action: PayloadAction<{ tracks: StorytellerTrack[] }>) {
      const hasTracksFromAnotherBook = action.payload.tracks.some(
        (track) => track.bookUuid !== state.currentlyPlayingBookUuid,
      )
      if (hasTracksFromAnotherBook) {
        logger.debug(
          `playerQueued: ignoring tracks for a different book while ${state.currentlyPlayingBookUuid ?? "none"} is open`,
        )
        return
      }

      state.isAudioLoading = false
      state.tracks = action.payload.tracks
    },
    playbackSpeedContextChanged(
      state,
      action: PayloadAction<{ context: "listening" | "reading" }>,
    ) {
      state.playbackSpeedContext = action.payload.context
    },
    // Seeds the currently-playing book + tracks when attaching to a session that
    // was started outside the app (e.g. Android Auto). Unlike bookOpened, this
    // has no listener side-effects: the native session is already playing, so we
    // only mirror its state into the store, never (re)load or seek the player.
    playerAttached(
      state,
      action: PayloadAction<{
        bookUuid: UUID
        format: "readaloud" | "audiobook"
        tracks: StorytellerTrack[]
      }>,
    ) {
      state.currentlyPlayingBookUuid = action.payload.bookUuid
      state.currentlyPlayingFormat = action.payload.format
      state.tracks = action.payload.tracks
      state.isAudioLoading = false
      state.playbackSpeedContext = "listening"
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
      if (action.payload.track.bookUuid !== state.currentlyPlayingBookUuid) {
        logger.debug(
          `audioTrackChanged: ignoring track for ${action.payload.track.bookUuid} while ${state.currentlyPlayingBookUuid ?? "none"} is open`,
        )
        return
      }

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
    bookDeleted(state, action: PayloadAction<{ bookUuid: UUID }>) {
      const { bookUuid } = action.payload

      if (state.currentlyPlayingBookUuid === bookUuid) {
        state.currentlyPlayingBookUuid = null
        state.currentlyPlayingFormat = null
        state.playbackSpeedContext = "listening"
        state.isAudioLoading = false
        state.tracks = []
        state.position = 0
        state.isPlaying = false
        state.currentTrack = null
        state.currentTrackIndex = 0
      }

      // Clean up return position for deleted book
      delete state.returnToPositions[bookUuid]
    },
    miniPlayerWidgetSwiped(state) {
      state.isAudioLoading = false
      state.tracks = []
      state.position = 0
      state.isPlaying = false
      state.currentlyPlayingBookUuid = null
      state.currentlyPlayingFormat = null
      state.playbackSpeedContext = "listening"
      state.currentTrack = null
      state.currentTrackIndex = 0
    },
    searchQueryChanged(state, action: PayloadAction<{ query: string }>) {
      state.currentSearchQuery = action.payload.query
    },
    footnoteOpened(state, action: PayloadAction<{ content: string }>) {
      state.footnoteContent = action.payload.content
    },
    footnoteClosed(state) {
      state.footnoteContent = null
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
          state.playbackSpeedContext = "listening"
          state.tracks = []
          state.position = 0
          state.isPlaying = false
          state.currentTrack = null
          state.currentTrackIndex = 0
        }
      },
    )
    builder.addMatcher(
      isAnyOf(bookmarkPressed, navItemPressed),
      (state, action) => {
        const { bookUuid, currentLocator } = action.payload
        if (!currentLocator) return
        state.returnToPositions[bookUuid] = { locator: currentLocator }
      },
    )
    builder.addMatcher(
      isAnyOf(clearReturnPosition, returnToPreviousPosition),
      (state, action) => {
        const { bookUuid } = action.payload
        delete state.returnToPositions[bookUuid]
      },
    )
  },
})
