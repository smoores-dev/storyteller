import { useLocalSearchParams } from "expo-router"

import { Epub } from "../../../../components/Epub"
import { useAppSelector } from "../../../../store/appState"
import {
  getBookshelfBook,
  getLocator,
} from "../../../../store/selectors/bookshelfSelectors"
import { useIsFocused } from "../../../../hooks/useIsFocused"

export default function BookScreen() {
  const { id } = useLocalSearchParams() as { id: string }

  const bookId = parseInt(id, 10)

  const book = useAppSelector((state) => getBookshelfBook(state, bookId))
  const timestampedLocator = useAppSelector((state) =>
    getLocator(state, bookId),
  )
  const locator = timestampedLocator?.locator

  const isFocused = useIsFocused()

  return (
    book &&
    locator &&
    isFocused && <Epub key={book.id} book={book} locator={locator} />
  )
}
