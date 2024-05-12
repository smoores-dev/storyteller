import { Link } from "expo-router"
import { Pressable, StyleSheet, View } from "react-native"
import { BookOpenOutlineIcon } from "../icons/BookOpenOutlineIcon"
import { SpedometerIcon } from "../icons/SpedometerIcon"
import { TableOfContentsIcon } from "../icons/TableOfContentsIcon"
import { useAppDispatch, useAppSelector } from "../store/appState"
import { getCurrentlyPlayingBook } from "../store/selectors/bookshelfSelectors"
import { ToolbarDialog, toolbarSlice } from "../store/slices/toolbarSlice"
import { PlayIcon } from "../icons/PlayIcon"
import { BookmarkIcon } from "../icons/BookmarkIcon"

type Props = {
  mode: "audio" | "text"
}

export function Toolbar({ mode }: Props) {
  const book = useAppSelector(getCurrentlyPlayingBook)

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

        <Pressable>
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
