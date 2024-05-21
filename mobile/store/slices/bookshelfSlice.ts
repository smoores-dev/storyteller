import { PitchAlgorithm, ResourceObject } from "react-native-track-player"
import { BookAuthor } from "../../apiModels"
import { PayloadAction, createAction, createSlice } from "@reduxjs/toolkit"
import {
  ReadiumLocator,
  ReadiumManifest,
} from "../../modules/readium/src/Readium.types"
import { areLocatorsEqual } from "../../modules/readium"

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

export type BookshelfBook = {
  id: number
  title: string
  authors: Array<BookAuthor>
  manifest: ReadiumManifest
  bookmarks: ReadiumLocator[]
}

export type BookshelfState = {
  currentPlayingBookId: number | null
  isAudioLoading: boolean
  index: number[]
  entities: {
    [id: number]: BookshelfBook
  }
  locators: {
    [id: number]: ReadiumLocator
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

export const localBookImported = createAction(
  "bookshelf/localBookImported",
  (bookId: number, archiveUrl: string) => ({ payload: { bookId, archiveUrl } }),
)

export const playerPaused = createAction("bookshelf/playerPaused")

export const bookshelfSlice = createSlice({
  name: "bookshelf",
  initialState,
  reducers: {
    bookshelfHydrated(
      state,
      action: PayloadAction<{
        books: BookshelfBook[]
        locators: { [id: number]: ReadiumLocator }
      }>,
    ) {
      const { books, locators } = action.payload

      for (const book of books) {
        state.index.push(book.id)
        state.entities[book.id] = book
      }

      state.locators = locators
    },
    bookDownloadCompleted(
      state,
      action: PayloadAction<{
        book: BookshelfBook
        locator: ReadiumLocator
      }>,
    ) {
      const { book, locator } = action.payload

      state.index.push(book.id)
      state.entities[book.id] = book
      state.locators[book.id] = locator
    },
    navItemTapped(
      state,
      action: PayloadAction<{ bookId: number; locator: ReadiumLocator }>,
    ) {
      const { bookId, locator } = action.payload

      state.locators[bookId] = locator
    },
    bookmarkTapped(
      state,
      action: PayloadAction<{ bookId: number; bookmark: ReadiumLocator }>,
    ) {
      const { bookId, bookmark } = action.payload

      state.locators[bookId] = bookmark
    },
    bookRelocated(
      state,
      action: PayloadAction<{ bookId: number; locator: ReadiumLocator }>,
    ) {
      const { bookId, locator } = action.payload

      state.locators[bookId] = locator
    },
    bookOpenPressed(state, action: PayloadAction<{ bookId: number }>) {
      const { bookId } = action.payload

      state.isAudioLoading = state.currentPlayingBookId !== bookId
      state.currentPlayingBookId = bookId
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
      action: PayloadAction<{ bookId: number; locator: ReadiumLocator }>,
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
  },
})
