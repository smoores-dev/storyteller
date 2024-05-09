import { useAppSelector } from "../store/appState"
import { getLibraryBook } from "../store/selectors/librarySelectors"
import { getIsBookInBookshelf } from "../store/selectors/bookshelfSelectors"
import { BookLink } from "./BookLink"
import { BookDownload } from "./BookDownload"

type Props = {
  bookId: number
}

export function LibraryBook({ bookId }: Props) {
  const book = useAppSelector((state) => getLibraryBook(state, bookId))
  const isInBookshelf = useAppSelector((state) =>
    getIsBookInBookshelf(state, bookId),
  )

  if (!book) return null

  return isInBookshelf ? (
    <BookLink bookId={bookId} />
  ) : (
    <BookDownload bookId={bookId} />
  )
}
