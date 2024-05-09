import { RootState } from "../appState"

export function getLibraryBook(state: RootState, bookId: number) {
  return state.library.entities[bookId] ?? null
}

export function getIsBookDownloading(state: RootState, bookId: number) {
  return !!state.library.entities[bookId]?.downloading
}

export function getBookDownloadProgress(state: RootState, bookId: number) {
  const book = state.library.entities[bookId]
  if (!book?.downloading) return null

  return book.downloadProgress
}

export function getLibraryBookIds(state: RootState) {
  return state.library.index
}

export function getIsLibraryLoading(state: RootState) {
  return state.library.loading
}
