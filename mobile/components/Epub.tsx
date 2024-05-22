import { useEffect, useRef, useState } from "react"
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { Link, Tabs } from "expo-router"
import { useKeepAwake } from "expo-keep-awake"
import { BookshelfBook, bookshelfSlice } from "../store/slices/bookshelfSlice"
import { EPUBView } from "../modules/readium"
import {
  EPUBViewRef,
  ReadiumLocator,
} from "../modules/readium/src/Readium.types"
import { ChevronLeftIcon } from "../icons/ChevronLeftIcon"
import { UIText } from "./UIText"
import { PlayPause } from "./PlayPause"
import { MiniPlayer } from "./MiniPlayer"
import { useAudioBook } from "../hooks/useAudioBook"
import { Toolbar } from "./Toolbar"
import { ToolbarDialogs } from "./ToolbarDialogs"
import { useAppDispatch, useAppSelector } from "../store/appState"
import { getLocator } from "../store/selectors/bookshelfSelectors"
import { SelectionMenu } from "./SelectionMenu"

type Props = {
  book: BookshelfBook
  locator: ReadiumLocator
}

export function Epub({ book, locator }: Props) {
  useKeepAwake()
  const [activeBookmarks, setActiveBookmarks] = useState<ReadiumLocator[]>([])
  const [selection, setSelection] = useState<{
    x: number
    y: number
    locator: ReadiumLocator
  } | null>(null)

  const dispatch = useAppDispatch()

  const insets = useSafeAreaInsets()

  const dimensions = useWindowDimensions()

  const currentLocator = useAppSelector((state) => getLocator(state, book.id))

  const [showInterface, setShowInterface] = useState(true)
  const epubViewRef = useRef<EPUBViewRef | null>(null)

  const {
    percentComplete,
    progress,
    remainingTime,
    isPlaying,
    isLoading,
    startPosition,
    endPosition,
  } = useAudioBook()

  useEffect(() => {
    epubViewRef.current
      ?.findLocatorsOnPage(book.bookmarks)
      .then((found) => setActiveBookmarks(found))
  }, [currentLocator?.locations?.progression, book.bookmarks])

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      <Tabs.Screen options={{ tabBarStyle: { display: "none" } }} />
      <ToolbarDialogs />
      {selection && (
        <SelectionMenu
          x={selection.x}
          y={selection.y}
          locator={selection.locator}
        />
      )}
      <View
        style={[
          styles.epubWrapper,
          {
            top: insets.top + 12,
          },
        ]}
      >
        <EPUBView
          ref={epubViewRef}
          style={styles.epub}
          bookId={book.id}
          locator={locator}
          onLocatorChange={(event) =>
            dispatch(
              bookshelfSlice.actions.bookRelocated({
                bookId: book.id,
                locator: event.nativeEvent,
              }),
            )
          }
          onMiddleTouch={() => {
            setShowInterface((p) => !p)
          }}
          onDoubleTouch={(event) => {
            dispatch(
              bookshelfSlice.actions.bookDoubleTapped({
                bookId: book.id,
                locator: event.nativeEvent,
              }),
            )
          }}
          onSelection={(event) => {
            if ("cleared" in event.nativeEvent) {
              setSelection(null)
            } else {
              setSelection(event.nativeEvent)
            }
          }}
          isPlaying={isPlaying}
        />
      </View>
      {showInterface && (
        <View style={[styles.backButton, { top: insets.top }]}>
          <Link href="/" asChild>
            <Pressable hitSlop={20}>
              <ChevronLeftIcon />
            </Pressable>
          </Link>
        </View>
      )}
      {showInterface && (
        <View
          style={[
            styles.toolbarWrapper,
            {
              top: insets.top + 12,
              bottom: dimensions.height - insets.top - 20,
            },
          ]}
        >
          <Toolbar mode="text" activeBookmarks={activeBookmarks} />
        </View>
      )}
      {!showInterface ? (
        <View style={styles.playerStatus}>
          <UIText>
            {percentComplete}% - {remainingTime} left
          </UIText>
          <PlayPause isPlaying={isPlaying} isLoading={isLoading} />
        </View>
      ) : (
        <MiniPlayer
          book={book}
          progress={progress}
          startPosition={startPosition}
          isPlaying={isPlaying}
          isLoading={isLoading}
          endPosition={endPosition}
          style={styles.miniPlayer}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "white",
  },
  epubWrapper: {
    position: "absolute",
    bottom: 80,
    left: 0,
    right: 0,
    zIndex: 1,
    ...(Platform.OS === "android" && { paddingVertical: 36 }),
  },
  epub: { flex: 1 },
  backButton: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    zIndex: 3,
  },
  toolbarWrapper: {
    position: "absolute",
    right: 12,
    left: 50,
    zIndex: 3,
    alignItems: "flex-end",
  },
  playerStatus: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 24,
    bottom: 27,
    left: 12,
    right: 16,
    zIndex: 3,
  },
  miniPlayer: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 32,
    zIndex: 3,
  },
})
