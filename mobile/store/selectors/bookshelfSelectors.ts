import { createSelector } from "@reduxjs/toolkit"
import { RootState } from "../appState"
import { Highlight } from "../slices/bookshelfSlice"

export function getBookshelfBook(state: RootState, bookId: number) {
  return state.bookshelf.entities[bookId] ?? null
}

export function getLocator(state: RootState, bookId: number) {
  return state.bookshelf.locators[bookId] ?? null
}

export function getCurrentlyPlayingBook(state: RootState) {
  const bookId = state.bookshelf.currentPlayingBookId

  if (bookId === null) return null

  return state.bookshelf.entities[bookId] ?? null
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

export function getIsBookInBookshelf(state: RootState, bookId: number) {
  return !!getBookshelfBook(state, bookId)
}

export function getBookshelfBookIds(state: RootState) {
  return state.bookshelf.index
}

export function getBookmarks(state: RootState, bookId: number) {
  const book = getBookshelfBook(state, bookId)
  if (!book) return book
  return book.bookmarks
}

const EMPTY_HIGHLIGHTS: Highlight[] = []

export function getHighlights(state: RootState, bookId: number) {
  const book = getBookshelfBook(state, bookId)
  return book?.highlights ?? EMPTY_HIGHLIGHTS
}
