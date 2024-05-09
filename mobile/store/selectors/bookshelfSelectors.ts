import { RootState } from "../appState"

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

export function getIsBookInBookshelf(state: RootState, bookId: number) {
  return !!getBookshelfBook(state, bookId)
}

export function getBookshelfBookIds(state: RootState) {
  return state.bookshelf.index
}
