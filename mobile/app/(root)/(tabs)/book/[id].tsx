import { useLocalSearchParams } from "expo-router"

import { Epub } from "../../../../components/Epub"
import { useAppSelector } from "../../../../store/appState"
import {
  getBookshelfBook,
  getLocator,
} from "../../../../store/selectors/bookshelfSelectors"
import { useIsFocused } from "../../../../hooks/useIsFocused"
import { Platform } from "react-native"

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
    isFocused && (
      <Epub
        // On Android, sometimes the viewer fails to render after changing
        // chapters, so we remount when the chapter changes
        key={Platform.OS === "android" ? locator.href : book.id}
        book={book}
        locator={locator}
      />
    )
  )
}
