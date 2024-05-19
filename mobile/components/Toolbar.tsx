import { Link } from "expo-router"
import { Pressable, StyleSheet, View } from "react-native"
import { BookOpenOutlineIcon } from "../icons/BookOpenOutlineIcon"
import { SpedometerIcon } from "../icons/SpedometerIcon"
import { TableOfContentsIcon } from "../icons/TableOfContentsIcon"
import { useAppDispatch, useAppSelector } from "../store/appState"
import {
  getCurrentlyPlayingBook,
  getLocator,
} from "../store/selectors/bookshelfSelectors"
import { ToolbarDialog, toolbarSlice } from "../store/slices/toolbarSlice"
import { PlayIcon } from "../icons/PlayIcon"
import { BookmarkIcon } from "../icons/BookmarkIcon"
import { bookshelfSlice } from "../store/slices/bookshelfSlice"
import { ReadiumLocator } from "../modules/readium/src/Readium.types"

type Props = {
  mode: "audio" | "text"
  activeBookmarks: ReadiumLocator[]
}

export function Toolbar({ mode, activeBookmarks }: Props) {
  const book = useAppSelector(getCurrentlyPlayingBook)
  const currentLocator = useAppSelector(
    (state) => book && getLocator(state, book.id),
  )

  const dispatch = useAppDispatch()

  if (!book) return null

  return (
    <>
      <View style={styles.toolbar}>
        <Pressable
          style={styles.toolbarButton}
          hitSlop={20}
          onPress={() => {
            dispatch(
              toolbarSlice.actions.dialogToggled({
                dialog: ToolbarDialog.SPEED,
              }),
            )
          }}
        >
          <SpedometerIcon />
        </Pressable>

        <Pressable
          hitSlop={20}
          disabled={!currentLocator}
          onPress={() => {
            if (activeBookmarks.length) {
              dispatch(
                bookshelfSlice.actions.bookmarksRemoved({
                  bookId: book.id,
                  locators: activeBookmarks,
                }),
              )
            } else if (currentLocator) {
              dispatch(
                bookshelfSlice.actions.bookmarkAdded({
                  bookId: book.id,
                  locator: currentLocator,
                }),
              )
            }
          }}
        >
          <BookmarkIcon />
        </Pressable>

        <Pressable
          style={styles.toolbarButton}
          onPress={() => {
            dispatch(
              toolbarSlice.actions.dialogToggled({
                dialog: ToolbarDialog.TABLE_OF_CONTENTS,
              }),
            )
          }}
        >
          <TableOfContentsIcon />
        </Pressable>
        {mode === "audio" ? (
          <Link
            style={[styles.toolbarButton, styles.bookLink]}
            href={{ pathname: "/book/[id]", params: { id: book.id } }}
          >
            <BookOpenOutlineIcon />
          </Link>
        ) : (
          <Link style={[styles.toolbarButton]} href={{ pathname: "/player" }}>
            <PlayIcon />
          </Link>
        )}
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: "row",
  },
  toolbarButton: {
    marginHorizontal: 8,
  },
  bookLink: {
    marginTop: 2,
  },
})
