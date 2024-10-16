import { Image, Pressable, StyleSheet, View } from "react-native"
import { UIText } from "./UIText"
import { DownloadedIcon } from "../icons/DownloadedIcon"
import { BookOpenIcon } from "../icons/BookOpenIcon"
import { PlayIcon } from "../icons/PlayIcon"
import { MoreHorizontalIcon } from "../icons/MoreHorizontalIcon"
import { ProgressBar } from "./ProgressBar"
import { useAppDispatch, useAppSelector } from "../store/appState"
import { bookshelfSlice } from "../store/slices/bookshelfSlice"
import {
  getBookshelfBook,
  getLocator,
} from "../store/selectors/bookshelfSelectors"
import ContextMenu from "react-native-context-menu-view"
import { getLocalBookCoverUrl } from "../store/persistence/files"
import { logger } from "../logger"

type Props = {
  bookId: number
}

export function BookLink({ bookId }: Props) {
  const dispatch = useAppDispatch()
  const book = useAppSelector((state) => getBookshelfBook(state, bookId))
  const timestampedLocator = useAppSelector((state) =>
    getLocator(state, bookId),
  )
  const locator = timestampedLocator?.locator

  const location = Array.isArray(locator?.locations)
    ? locator.locations[0]
    : locator?.locations

  const percentComplete = Math.round((location?.totalProgression ?? 0) * 100)

  if (!book) return null

  return (
    <View style={styles.container}>
      <Image
        source={{ uri: getLocalBookCoverUrl(book.id) }}
        style={styles.image}
        onError={(error) => logger.error(error.nativeEvent.error)}
      />
      <View style={styles.details}>
        <View style={styles.bookInfo}>
          <UIText numberOfLines={2} style={styles.title}>
            {book.title}
          </UIText>
          <UIText style={styles.authors}>
            {book.authors.map((author) => author.name).join(", ")}
          </UIText>
        </View>
        <ProgressBar progress={percentComplete} />
        <View style={styles.controls}>
          <View style={styles.fileControls}>
            <DownloadedIcon style={styles.downloadIcon} />
            <View>
              <ContextMenu
                actions={[
                  {
                    title: "Delete",
                    destructive: true,
                    systemIcon: "trash.circle",
                  },
                ]}
                onPress={({ nativeEvent }) => {
                  switch (nativeEvent.index) {
                    case 0: {
                      dispatch(bookshelfSlice.actions.bookDeleted({ bookId }))
                      break
                    }
                    default: {
                      break
                    }
                  }
                }}
                dropdownMenuMode
              >
                <MoreHorizontalIcon />
              </ContextMenu>
            </View>
          </View>
          <View style={styles.readingControls}>
            <Pressable
              style={styles.bookOpenIcon}
              onPress={() => {
                dispatch(bookshelfSlice.actions.bookOpenPressed({ bookId }))
              }}
            >
              <BookOpenIcon />
            </Pressable>
            <Pressable
              onPress={() => {
                dispatch(bookshelfSlice.actions.playerOpenPressed({ bookId }))
              }}
            >
              <PlayIcon />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 40,
  },
  details: {
    flexDirection: "column",
    flex: 1,
    height: 136,
    marginRight: 24,
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  bookInfo: {},
  title: {
    fontSize: 17,
    fontWeight: "600",
  },
  authors: {
    fontSize: 15,
  },
  image: {
    height: 136,
    width: 88,
    marginRight: 20,
    borderRadius: 4,
    backgroundColor: "rgb(225, 225, 235)",
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  fileControls: {
    flexDirection: "row",
    alignItems: "center",
  },
  downloadIcon: {
    marginRight: 14,
  },
  readingControls: {
    flexDirection: "row",
    alignItems: "center",
  },
  bookOpenIcon: {
    marginRight: 16,
    flexDirection: "row",
    alignItems: "center",
  },
})
