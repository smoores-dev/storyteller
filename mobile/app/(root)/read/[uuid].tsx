import { useLocalSearchParams } from "expo-router"
import { useEffect } from "react"

import { Epub } from "@/components/Epub"
import { LoadingView } from "@/components/LoadingView"
import { useIsFocused } from "@/hooks/useIsFocused"
import { useIsNotBackground } from "@/hooks/useIsNotBackground"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import { useGetBookQuery } from "@/store/localApi"
import { bookshelfSlice } from "@/store/slices/bookshelfSlice"
import { type UUID } from "@/uuid"

export default function BookScreen() {
  const { uuid, format } = useLocalSearchParams() as {
    uuid: UUID
    format: "readaloud" | "ebook"
  }

  const dispatch = useAppDispatch()

  const { data: book } = useGetBookQuery({ uuid })
  const locator = book?.position?.locator

  const isFocused = useIsFocused()
  const isNotBackground = useIsNotBackground()

  const isAudioLoading = useAppSelector(
    (state) => state.bookshelf.isAudioLoading,
  )

  useEffect(() => {
    dispatch(bookshelfSlice.actions.bookOpened({ bookUuid: uuid, format }))
  }, [dispatch, format, uuid])

  return book && locator && isFocused && isNotBackground && !isAudioLoading ? (
    <Epub key={book.uuid} format={format} book={book} locator={locator} />
  ) : (
    <LoadingView />
  )
}
