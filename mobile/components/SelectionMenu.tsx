import {
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native"
import { ReadiumLocator } from "../modules/readium/src/Readium.types"
import { useAppDispatch } from "../store/appState"
import { Highlight, bookshelfSlice } from "../store/slices/bookshelfSlice"
import { highlightTints } from "../colors"
import { TrashIcon } from "../icons/TrashIcon"

type Props = {
  bookId: number
  x: number
  y: number
  locator: ReadiumLocator
  existingHighlight?: Highlight | null
  onClose: () => void
}

export function SelectionMenu({
  bookId,
  x,
  y,
  locator,
  existingHighlight,
  onClose,
}: Props) {
  const dimensions = useWindowDimensions()
  const dispatch = useAppDispatch()

  const menuWidth = existingHighlight ? 200 : 168

  const left = x - menuWidth / 2
  const leftAdjsted =
    left < 0
      ? 16
      : left + menuWidth > dimensions.width
        ? dimensions.width - (50 + menuWidth)
        : left

  return (
    <>
      <View style={[styles.menu, { top: y + 16, left: leftAdjsted }]}>
        {(
          Object.keys(highlightTints) as Array<keyof typeof highlightTints>
        ).map((color) => (
          <Pressable
            onPress={() => {
              if (existingHighlight) {
                dispatch(
                  bookshelfSlice.actions.highlightColorChanged({
                    bookId,
                    highlightId: existingHighlight.id,
                    color,
                  }),
                )
                onClose()
                return
              }
              dispatch(
                bookshelfSlice.actions.highlightCreated({
                  bookId,
                  highlight: { id: crypto.randomUUID(), color, locator },
                }),
              )
              onClose()
            }}
          >
            <View
              style={[
                styles.button,
                { backgroundColor: highlightTints[color] },
                existingHighlight?.color === color && {
                  borderWidth: 2,
                  borderColor: "black",
                },
              ]}
            ></View>
          </Pressable>
        ))}
        {existingHighlight && (
          <Pressable
            style={styles.trashButton}
            onPress={() => {
              dispatch(
                bookshelfSlice.actions.highlightRemoved({
                  bookId,
                  highlightId: existingHighlight.id,
                }),
              )
              onClose()
            }}
          >
            <TrashIcon />
          </Pressable>
        )}
      </View>
      {existingHighlight && (
        <TouchableOpacity style={styles.backdrop} onPress={onClose} />
      )}
    </>
  )
}

const styles = StyleSheet.create({
  menu: {
    position: "absolute",
    backgroundColor: "white",
    zIndex: 1000,
    flexDirection: "row",
    borderRadius: 8,
    shadowRadius: 4,
    shadowOpacity: 0.3,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowColor: "black",
  },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
  },
  button: {
    width: 24,
    height: 24,
    borderRadius: 12,
    margin: 8,
    borderWidth: 1,
    borderColor: "#AAA",
  },
  trashButton: {
    width: 24,
    height: 24,
    margin: 8,
  },
})
