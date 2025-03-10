import { PitchAlgorithm, ResourceObject } from "react-native-track-player"
import { BookAuthor } from "../../apiModels"
import { PayloadAction, createAction, createSlice } from "@reduxjs/toolkit"
import {
  ReadiumLocator,
  ReadiumManifest,
  TimestampedLocator,
} from "../../modules/readium/src/Readium.types"
import { areLocatorsEqual } from "../../modules/readium"
import type { UUID } from "crypto"
import { HighlightTint } from "../../colors"

export type BookshelfTrack = {
  bookId: number
  url: string | ResourceObject
  duration: number | undefined
  title: string
  album: string
  artist: string
  artwork: string | ResourceObject
  relativeUrl: string
  pitchAlgorithm: PitchAlgorithm
}

export type Highlight = {
  id: UUID
  color: HighlightTint
  locator: ReadiumLocator
}

export type BookshelfBook = {
  id: number
  title: string
  authors: Array<BookAuthor>
  manifest: ReadiumManifest
  bookmarks: ReadiumLocator[]
  highlights: Highlight[]
  positions: ReadiumLocator[]
}

export type BookshelfState = {
  currentPlayingBookId: number | null
  isAudioLoading: boolean
  index: number[]
  entities: {
    [id: number]: BookshelfBook
  }
  locators: {
    [id: number]: TimestampedLocator
  }
}

const initialState: BookshelfState = {
  currentPlayingBookId: null,
  isAudioLoading: false,
  index: [],
  entities: {},
  locators: {},
}

export const playerPositionUpdated = createAction(
  "bookshelf/playerPositionUpdated",
)

export const playerPositionSeeked = createAction(
  "bookshelf/playerPositionSeeked",
  (payload: { progress: number }) => ({
    payload,
  }),
)

export const playerTotalPositionSeeked = createAction(
  "bookshelf/playerTotalPositionSeeked",
  (payload: { progress: number }) => ({
    payload,
  }),
)

export const localBookImported = createAction(
  "bookshelf/localBookImported",
  (bookId: number, archiveUrl: string) => ({ payload: { bookId, archiveUrl } }),
)

export const playerPaused = createAction("bookshelf/playerPaused")

export const playerPlayed = createAction("bookshelf/playerPlayed")

export const playerTrackChanged = createAction(
  "bookshelf/playerTrackChanged",
  (payload: { index: number }) => ({
    payload,
  }),
)

export const nextTrackPressed = createAction("bookshelf/nextTrackPressed")

export const prevTrackPressed = createAction("bookshelf/prevTrackPressed")

function compareLocators(a: ReadiumLocator, b: ReadiumLocator) {
  if (a.locations?.totalProgression === undefined) {
    return -1
  }
  if (b.locations?.totalProgression === undefined) {
    return 1
  }
  const totalComp = a.locations.totalProgression - b.locations.totalProgression
  if (totalComp !== 0) {
    return totalComp
  }
  return (a.locations.progression ?? 0) - (b.locations.progression ?? 0)
}

export const bookshelfSlice = createSlice({
  name: "bookshelf",
  initialState,
  reducers: {
    bookshelfHydrated(
      state,
      action: PayloadAction<{
        books: BookshelfBook[]
        locators: { [id: number]: TimestampedLocator }
      }>,
    ) {
      const { books, locators } = action.payload

      for (const book of books) {
        book.bookmarks.sort((a, b) => compareLocators(a, b))
        book.highlights.sort((a, b) => compareLocators(a.locator, b.locator))
        state.index.push(book.id)
        state.entities[book.id] = book
      }

      state.locators = locators
    },
    bookDownloadCompleted(
      state,
      action: PayloadAction<{
        book: BookshelfBook
        locator: TimestampedLocator
      }>,
    ) {
      const { book, locator } = action.payload

      state.index.push(book.id)
      state.entities[book.id] = book
      state.locators[book.id] = locator
    },
    navItemTapped(
      state,
      action: PayloadAction<{ bookId: number; locator: TimestampedLocator }>,
    ) {
      const { bookId, locator } = action.payload

      state.locators[bookId] = locator
    },
    bookmarkTapped(
      state,
      action: PayloadAction<{ bookId: number; bookmark: TimestampedLocator }>,
    ) {
      const { bookId, bookmark } = action.payload

      state.locators[bookId] = bookmark
    },
    bookRelocated(
      state,
      action: PayloadAction<{ bookId: number; locator: TimestampedLocator }>,
    ) {
      const { bookId, locator } = action.payload

      state.locators[bookId] = locator
    },
    bookPositionSynced(
      state,
      action: PayloadAction<{ bookId: number; locator: TimestampedLocator }>,
    ) {
      const { bookId, locator } = action.payload

      state.locators[bookId] = locator
    },
    bookOpenPressed(state, action: PayloadAction<{ bookId: number }>) {
      const { bookId } = action.payload

      state.isAudioLoading = state.currentPlayingBookId !== bookId
      state.currentPlayingBookId = bookId
    },
    bookDoubleTapped(
      state,
      action: PayloadAction<{ bookId: number; locator: TimestampedLocator }>,
    ) {
      const { bookId, locator } = action.payload

      state.isAudioLoading = state.currentPlayingBookId !== bookId
      state.currentPlayingBookId = bookId
      state.locators[bookId] = locator
    },
    playerOpenPressed(state, action: PayloadAction<{ bookId: number }>) {
      const { bookId } = action.payload

      state.isAudioLoading = state.currentPlayingBookId !== bookId
      state.currentPlayingBookId = bookId
    },
    playerQueued(state) {
      state.isAudioLoading = false
    },
    playerPositionUpdateCompleted(
      state,
      action: PayloadAction<{ bookId: number; locator: TimestampedLocator }>,
    ) {
      const { bookId, locator } = action.payload

      state.locators[bookId] = locator
    },
    bookDeleted(state, action: PayloadAction<{ bookId: number }>) {
      const { bookId } = action.payload

      delete state.locators[bookId]
      delete state.entities[bookId]
      state.index = state.index.filter((id) => id !== bookId)

      if (state.currentPlayingBookId === bookId) {
        state.currentPlayingBookId = null
        state.isAudioLoading = false
      }
    },
    bookmarkAdded(
      state,
      action: PayloadAction<{ bookId: number; locator: ReadiumLocator }>,
    ) {
      const { bookId, locator } = action.payload

      const book = state.entities[bookId]
      if (!book) return

      book.bookmarks.push(locator)
      book.bookmarks.sort((a, b) => compareLocators(a, b))
    },
    bookmarksRemoved(
      state,
      action: PayloadAction<{ bookId: number; locators: ReadiumLocator[] }>,
    ) {
      const { bookId, locators } = action.payload

      const book = state.entities[bookId]
      if (!book) return

      book.bookmarks = book.bookmarks.filter((bookmark) =>
        locators.some((locator) => !areLocatorsEqual(bookmark, locator)),
      )
    },
    highlightCreated(
      state,
      action: PayloadAction<{ bookId: number; highlight: Highlight }>,
    ) {
      const { bookId, highlight } = action.payload

      const book = state.entities[bookId]
      if (!book) return

      book.highlights.push(highlight)
      book.highlights.sort((a, b) => compareLocators(a.locator, b.locator))
    },
    highlightRemoved(
      state,
      action: PayloadAction<{ bookId: number; highlightId: UUID }>,
    ) {
      const { bookId, highlightId } = action.payload

      const book = state.entities[bookId]
      if (!book) return

      book.highlights = book.highlights.filter(({ id }) => id !== highlightId)
    },
    highlightColorChanged(
      state,
      action: PayloadAction<{
        bookId: number
        highlightId: UUID
        color: Highlight["color"]
      }>,
    ) {
      const { bookId, highlightId, color } = action.payload

      const book = state.entities[bookId]
      if (!book) return

      const highlight = book.highlights.find((h) => h.id === highlightId)
      if (!highlight) return

      highlight.color = color
    },
  },
})
