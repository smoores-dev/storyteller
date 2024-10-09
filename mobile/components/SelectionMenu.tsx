import {
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native"
import Clipboard from "@react-native-clipboard/clipboard"
import uuid from "react-native-uuid"
import { ReadiumLocator } from "../modules/readium/src/Readium.types"
import { useAppDispatch } from "../store/appState"
import { Highlight, bookshelfSlice } from "../store/slices/bookshelfSlice"
import { TrashIcon } from "../icons/TrashIcon"
import { HighlightColorPicker } from "./HighlightColorPicker"
import { useColorTheme } from "../hooks/useColorTheme"
import { CopyIcon } from "../icons/CopyIcon"
import type { UUID } from "node:crypto"

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
  const { background } = useColorTheme()
  const dispatch = useAppDispatch()

  const numIcons = existingHighlight ? 7 : 6
  const panelWidth = numIcons * (24 + 16)
  const leftOffset = Math.max(
    16, // Minimum left padding
    Math.min(x - panelWidth / 2, dimensions.width - panelWidth - 16), // Prevent overflow on the right side
  )

  return (
    <>
      <View
        style={[
          styles.menu,
          { backgroundColor: background, top: y + 16, left: leftOffset },
        ]}
      >
        <HighlightColorPicker
          value={existingHighlight?.color}
          onChange={(color) => {
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
                highlight: { id: uuid.v4() as UUID, color, locator },
              }),
            )
            onClose()
          }}
        />
        <Pressable
          style={styles.copyButton}
          onPress={() => {
            Clipboard.setString(
              (
                existingHighlight?.locator ?? locator
              ).text?.highlight?.toString() ?? "",
            )
            onClose()
          }}
        >
          <CopyIcon />
        </Pressable>
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
  copyButton: {
    width: 24,
    height: 24,
    margin: 8,
  },
  trashButton: {
    width: 24,
    height: 24,
    margin: 8,
  },
})
