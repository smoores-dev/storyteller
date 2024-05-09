import { PayloadAction, createSlice } from "@reduxjs/toolkit"
import { BookAuthor, BookDetail } from "../../apiModels"
import { bookshelfSlice } from "./bookshelfSlice"
import { apiSlice } from "./apiSlice"

export type LibraryBook =
  | {
      id: number
      title: string
      authors: Array<BookAuthor>
      downloading: false
    }
  | {
      id: number
      title: string
      authors: Array<BookAuthor>
      downloading: true
      downloadProgress: number
    }

export type LibraryState = {
  loading: boolean
  index: number[]
  entities: {
    [id: number]: LibraryBook
  }
}

const initialState: LibraryState = {
  loading: false,
  index: [],
  entities: {},
}

export const librarySlice = createSlice({
  name: "library",
  initialState,
  reducers: {
    libraryTabOpened(state) {
      if (state.index.length) return

      state.loading = true
    },
    libraryRefreshed(state) {
      state.loading = true
    },
    libraryDownloadHydrated(
      state,
      action: PayloadAction<{ book: LibraryBook }>,
    ) {
      const { book } = action.payload
      state.index.push(book.id)
      state.entities[book.id] = book
    },
    libraryLoaded(state, action: PayloadAction<{ bookDetails: BookDetail[] }>) {
      for (const bookDetail of action.payload.bookDetails) {
        if (state.index.includes(bookDetail.id)) continue

        state.index.push(bookDetail.id)
        state.entities[bookDetail.id] = {
          id: bookDetail.id,
          title: bookDetail.title,
          authors: bookDetail.authors,
          downloading: false,
        }
      }
      state.loading = false
    },
    bookDownloadPressed(state, action: PayloadAction<{ bookId: number }>) {
      const { bookId } = action.payload

      const book = state.entities[bookId]
      if (!book) return

      state.entities[bookId] = {
        ...book,
        downloading: true,
        downloadProgress: 0,
      }
    },
    bookDownloadProgressUpdated(
      state,
      action: PayloadAction<{ bookId: number; progress: number }>,
    ) {
      const { bookId, progress } = action.payload

      const book = state.entities[bookId]
      if (!book) return

      state.entities[bookId] = {
        ...book,
        downloading: true,
        downloadProgress: progress,
      }
    },
  },
  extraReducers(builder) {
    builder.addCase(bookshelfSlice.actions.bookDeleted, (state, action) => {
      const { bookId } = action.payload

      const libraryBook = state.entities[bookId]

      if (libraryBook) {
        libraryBook.downloading = false
      }
    })
    builder.addCase(apiSlice.actions.changeServerButtonTapped, (state) => {
      state.index = []
      state.entities = {}
      state.loading = false
    })
  },
})
