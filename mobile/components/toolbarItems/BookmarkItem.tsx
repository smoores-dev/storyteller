import { skipToken } from "@reduxjs/toolkit/query"
import { BookmarkCheck, BookmarkIcon } from "lucide-react-native"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { type Bookmark } from "@/database/bookmarks"
import { useAppSelector } from "@/store/appState"
import {
  useCreateBookmarkMutation,
  useDeleteBookmarksMutation,
  useGetBookQuery,
} from "@/store/localApi"
import { getCurrentlyPlayingBookUuid } from "@/store/selectors/bookshelfSelectors"
import { randomUUID } from "@/uuid"

interface Props {
  activeBookmarks: Bookmark[]
}

export function BookmarkItem({ activeBookmarks }: Props) {
  const bookUuid = useAppSelector(getCurrentlyPlayingBookUuid)
  const { data: book } = useGetBookQuery(
    bookUuid ? { uuid: bookUuid } : skipToken,
  )
  const currentLocator = book?.position?.locator
  const [createBookmark] = useCreateBookmarkMutation()
  const [deleteBookmarks] = useDeleteBookmarksMutation()

  if (!bookUuid) return null

  return (
    <Button
      className="items-center rounded"
      size="icon"
      variant="ghost"
      onPress={() => {
        if (activeBookmarks.length) {
          deleteBookmarks({
            bookUuid,
            bookmarkUuids: activeBookmarks.map((bookmark) => bookmark.uuid),
          })
        } else if (currentLocator) {
          createBookmark({
            uuid: randomUUID(),
            bookUuid,
            locator: currentLocator,
          })
        }
      }}
    >
      {activeBookmarks.length ? (
        <Icon as={BookmarkCheck} size={24} />
      ) : (
        <Icon as={BookmarkIcon} size={24} />
      )}
    </Button>
  )
}
