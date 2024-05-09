import { useLocalSearchParams } from "expo-router"

import { Epub } from "../../../../components/Epub"
import { useAppDispatch, useAppSelector } from "../../../../store/appState"
import {
  getBookshelfBook,
  getLocator,
} from "../../../../store/selectors/bookshelfSelectors"
import { bookshelfSlice } from "../../../../store/slices/bookshelfSlice"
import { useIsFocused } from "../../../../hooks/useIsFocused"
import { Platform } from "react-native"

export default function BookScreen() {
  const { id } = useLocalSearchParams() as { id: string }

  const bookId = parseInt(id, 10)

  const book = useAppSelector((state) => getBookshelfBook(state, bookId))
  const locator = useAppSelector((state) => getLocator(state, bookId))

  const dispatch = useAppDispatch()

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
        onLocatorChange={(newLocator) =>
          dispatch(
            bookshelfSlice.actions.bookRelocated({
              bookId,
              locator: newLocator,
            }),
          )
        }
      />
    )
  )
}
