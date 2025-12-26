import Clipboard from "@react-native-clipboard/clipboard"
import { skipToken } from "@reduxjs/toolkit/query"
import {
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { useColorTheme } from "@/hooks/useColorTheme"
import { CopyIcon } from "@/icons/CopyIcon"
import { TrashIcon } from "@/icons/TrashIcon"
import { type ReadiumLocator } from "@/modules/readium/src/Readium.types"
import {
  useCreateHighlightMutation,
  useDeleteHighlightMutation,
  useGetHighlightQuery,
  useUpdateHighlightMutation,
} from "@/store/localApi"
import { type UUID, randomUUID } from "@/uuid"

import { HighlightColorPicker } from "./HighlightColorPicker"

type Props = {
  bookUuid: UUID
  x: number
  y: number
  locator: ReadiumLocator
  existingHighlight?: UUID | null
  onClose: () => void
}

export function SelectionMenu({
  bookUuid,
  x,
  y,
  locator,
  existingHighlight: highlightUuid,
  onClose,
}: Props) {
  const dimensions = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const { background } = useColorTheme()
  const [createHighlight] = useCreateHighlightMutation()
  const [updateHighlight] = useUpdateHighlightMutation()
  const [deleteHighlight] = useDeleteHighlightMutation()
  const { data: existingHighlight } = useGetHighlightQuery(
    highlightUuid ? { uuid: highlightUuid } : skipToken,
  )

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
          {
            backgroundColor: background,
            top: Math.max(y - 40, insets.top),
            left: leftOffset,
          },
        ]}
      >
        <HighlightColorPicker
          value={existingHighlight?.color}
          onChange={(color) => {
            if (existingHighlight) {
              updateHighlight({ highlightId: existingHighlight.uuid, color })
              onClose()
              return
            }

            createHighlight({
              highlightId: randomUUID(),
              color,
              locator,
              bookUuid,
            })
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
              deleteHighlight({ uuid: existingHighlight.uuid })
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
