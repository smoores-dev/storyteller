import { skipToken } from "@reduxjs/toolkit/query"
import { Trash2 } from "lucide-react-native"
import { useMemo } from "react"
import { View } from "react-native"
import { ScrollView } from "react-native-gesture-handler"
import Swipeable from "react-native-gesture-handler/ReanimatedSwipeable"

import { Stack } from "@/components/ui/Stack"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { getHrefChapterTitle, positionToPageCount } from "@/links"
import { bookmarkPressed } from "@/store/actions"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import {
  useDeleteBookmarksMutation,
  useGetBookBookmarksQuery,
  useGetBookQuery,
} from "@/store/localApi"
import { getCurrentlyPlayingBookUuid } from "@/store/selectors/bookshelfSelectors"

export function Bookmarks() {
  const bookUuid = useAppSelector(getCurrentlyPlayingBookUuid)
  const dispatch = useAppDispatch()
  const { data: bookmarks } = useGetBookBookmarksQuery(
    bookUuid ? { bookUuid } : skipToken,
  )
  const { data: book } = useGetBookQuery(
    bookUuid ? { uuid: bookUuid } : skipToken,
  )
  const [deleteBookmarks] = useDeleteBookmarksMutation()

  const bookmarkTitles = useMemo(() => {
    const toc = book?.readaloud?.epubManifest?.toc
    if (!toc) return []
    return (
      bookmarks?.map((bookmark) => {
        return getHrefChapterTitle(bookmark.locator.href, toc)
      }) ?? []
    )
  }, [book?.readaloud?.epubManifest?.toc, bookmarks])

  const bookmarkPages = useMemo(() => {
    const positions = book?.readaloud?.positions
    if (!positions) return []

    return (
      bookmarks?.map((bookmark) => {
        const chapterPositions = positions.filter(
          (position) => position.href === bookmark.locator.href,
        )
        const bookmarkPosition =
          (chapterPositions.findIndex(
            (position) =>
              (position.locations?.progression ?? 0) >=
              (bookmark.locator.locations?.progression ?? 0),
          ) ?? 0) + 1

        const bookmarkPage = positionToPageCount(bookmarkPosition)
        return bookmarkPage
      }) ?? []
    )
  }, [book?.readaloud?.positions, bookmarks])

  if (!bookmarks || !bookUuid) return null

  if (!bookmarks.length) {
    return (
      <Stack className="p-8">
        <Text className="text-muted-foreground">
          No bookmarks yet! Try adding some by pressing the bookmark icon in the
          toolbar.
        </Text>
      </Stack>
    )
  }

  return (
    <ScrollView>
      {bookmarks.map((bookmark, index) => (
        <Swipeable
          key={bookmark.uuid}
          renderRightActions={() => (
            <Button
              className="align-center h-full w-20 justify-center bg-red-500 sm:h-full sm:w-20"
              variant="destructive"
              onPress={() => {
                deleteBookmarks({
                  bookUuid: bookmark.bookUuid,
                  bookmarkUuids: [bookmark.uuid],
                })
              }}
            >
              <Icon as={Trash2} size={24} className="text-white" />
            </Button>
          )}
        >
          <View className="bg-background px-2">
            <Button
              onPress={() => {
                dispatch(
                  bookmarkPressed({
                    bookUuid,
                    locator: bookmark.locator,
                    timestamp: Date.now(),
                  }),
                )
              }}
              variant="ghost"
              className="h-auto flex-col items-start border-b border-b-gray-400 p-4 sm:h-auto"
            >
              <Text className="text-sm font-bold">{bookmarkTitles[index]}</Text>
              <Text className="mt-2 text-xs">Page {bookmarkPages[index]}</Text>
            </Button>
          </View>
        </Swipeable>
      ))}
    </ScrollView>
  )
}
