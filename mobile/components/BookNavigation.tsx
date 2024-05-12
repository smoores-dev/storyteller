import { Pressable, StyleSheet, TouchableOpacity, View } from "react-native"
import { TableOfContents } from "./TableOfContents"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useState } from "react"
import { UIText } from "./UIText"

type Props = {
  onOutsideTap: () => void
}

enum BookNavTab {
  TABLE_OF_CONTENTS = "TABLE_OF_CONTENTS",
  BOOKMARKS = "BOOKMARKS",
  HIGHLIGHTS = "HIGHLIGHTS",
}

export function BookNavigation({ onOutsideTap }: Props) {
  const [selectedTab, setSelectedTab] = useState(BookNavTab.TABLE_OF_CONTENTS)
  const insets = useSafeAreaInsets()

  return (
    <>
      <TouchableOpacity style={styles.backdrop} onPress={onOutsideTap} />
      <View style={{ ...styles.dialog, top: insets.top + styles.dialog.top }}>
        <View style={styles.tabs}>
          <Pressable
            style={[
              styles.tab,
              selectedTab === BookNavTab.TABLE_OF_CONTENTS &&
                styles.selectedTab,
            ]}
            onPress={() => {
              setSelectedTab(BookNavTab.TABLE_OF_CONTENTS)
            }}
          >
            <UIText>Contents</UIText>
          </Pressable>
          <Pressable
            style={[
              styles.tab,
              selectedTab === BookNavTab.BOOKMARKS && styles.selectedTab,
            ]}
            onPress={() => {
              setSelectedTab(BookNavTab.BOOKMARKS)
            }}
          >
            <UIText>Bookmarks</UIText>
          </Pressable>
          <Pressable
            style={[
              styles.tab,
              selectedTab === BookNavTab.HIGHLIGHTS && styles.selectedTab,
            ]}
            onPress={() => {
              setSelectedTab(BookNavTab.HIGHLIGHTS)
            }}
          >
            <UIText>Highlights</UIText>
          </Pressable>
        </View>
        {selectedTab === BookNavTab.TABLE_OF_CONTENTS ? (
          <TableOfContents />
        ) : selectedTab === BookNavTab.BOOKMARKS ? null : null}
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: "row",
    justifyContent: "space-around",
    borderBottomWidth: 1,
    borderBottomColor: "black",
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
    borderColor: "black",
    bottom: 300,
    zIndex: 3,
    backgroundColor: "white",
  },
  selectedTab: {
    backgroundColor: "#EEE",
  },
  tab: {
    margin: 0,
    paddingTop: 8,
    paddingBottom: 24,
    paddingHorizontal: 8,
  },
})
