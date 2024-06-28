import { Pressable, StyleSheet, TouchableOpacity, View } from "react-native"
import { TableOfContents } from "./TableOfContents"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useState } from "react"
import { UIText } from "./UIText"
import { Bookmarks } from "./Bookmarks"
import { Highlights } from "./Highlights"
import { useColorTheme } from "../hooks/useColorTheme"

type Props = {
  onOutsideTap: () => void
}

enum BookNavTab {
  TABLE_OF_CONTENTS = "TABLE_OF_CONTENTS",
  BOOKMARKS = "BOOKMARKS",
  HIGHLIGHTS = "HIGHLIGHTS",
}

export function BookNavigation({ onOutsideTap }: Props) {
  const { background, foreground } = useColorTheme()
  const [selectedTab, setSelectedTab] = useState(BookNavTab.TABLE_OF_CONTENTS)
  const insets = useSafeAreaInsets()

  return (
    <>
      <TouchableOpacity style={styles.backdrop} onPress={onOutsideTap} />
      <View
        style={[
          styles.dialog,
          { top: insets.top + styles.dialog.top },
          { backgroundColor: background, shadowColor: foreground },
        ]}
      >
        <View style={styles.tabs}>
          <Pressable
            style={styles.tab}
            onPress={() => {
              setSelectedTab(BookNavTab.TABLE_OF_CONTENTS)
            }}
          >
            <UIText
              style={
                selectedTab === BookNavTab.TABLE_OF_CONTENTS &&
                styles.selectedTab
              }
            >
              Contents
            </UIText>
          </Pressable>
          <Pressable
            style={styles.tab}
            onPress={() => {
              setSelectedTab(BookNavTab.BOOKMARKS)
            }}
          >
            <UIText
              style={selectedTab === BookNavTab.BOOKMARKS && styles.selectedTab}
            >
              Bookmarks
            </UIText>
          </Pressable>
          <Pressable
            style={styles.tab}
            onPress={() => {
              setSelectedTab(BookNavTab.HIGHLIGHTS)
            }}
          >
            <UIText
              style={
                selectedTab === BookNavTab.HIGHLIGHTS && styles.selectedTab
              }
            >
              Highlights
            </UIText>
          </Pressable>
        </View>
        {selectedTab === BookNavTab.TABLE_OF_CONTENTS ? (
          <TableOfContents />
        ) : selectedTab === BookNavTab.BOOKMARKS ? (
          <Bookmarks />
        ) : (
          <Highlights />
        )}
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: "row",
    justifyContent: "space-around",
    borderBottomWidth: 1,
    borderBottomColor: "#AAA",
  },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
  },
  dialog: {
    position: "absolute",
    right: 32,
    left: 74,
    top: 56,
    paddingVertical: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#AAA",
    shadowRadius: 4,
    shadowOpacity: 0.3,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    bottom: 300,
    zIndex: 3,
    elevation: 3,
  },
  selectedTab: {
    fontWeight: "bold",
  },
  tab: {
    margin: 0,
    paddingTop: 8,
    paddingBottom: 24,
    paddingHorizontal: 8,
  },
})
