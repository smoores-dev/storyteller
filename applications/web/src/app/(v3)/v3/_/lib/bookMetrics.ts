export function bookPageCount(book: {
  pageCount: number | null
  ebook: { pageCount: number | null } | null
  readaloud: { pageCount: number | null } | null
}): number | null {
  return (
    book.pageCount ?? book.ebook?.pageCount ?? book.readaloud?.pageCount ?? null
  )
}

export function bookDuration(book: {
  duration: number | null
  audiobook: { duration: number | null } | null
  readaloud: { duration: number | null } | null
}): number | null {
  return (
    book.duration ??
    book.audiobook?.duration ??
    book.readaloud?.duration ??
    null
  )
}
