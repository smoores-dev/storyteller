import { useRef, useState } from "react"
import { Platform, Pressable, StyleSheet, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { Link, Tabs } from "expo-router"
import { useKeepAwake } from "expo-keep-awake"
import {
  BookshelfBook,
  Highlight,
  bookshelfSlice,
} from "../store/slices/bookshelfSlice"
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
import { SelectionMenu } from "./SelectionMenu"
import { useColorTheme } from "../hooks/useColorTheme"
import { getFilledBookPreferences } from "../store/selectors/preferencesSelectors"

type Props = {
  book: BookshelfBook
  locator: ReadiumLocator
}

export function Epub({ book, locator }: Props) {
  useKeepAwake()

  const hasLoadedRef = useRef(false)
  const { foreground, background } = useColorTheme()
  const [activeBookmarks, setActiveBookmarks] = useState<ReadiumLocator[]>([])
  const [activeHighlight, setActiveHighlight] = useState<Highlight | null>(null)
  const preferences = useAppSelector((state) =>
    getFilledBookPreferences(state, book.id),
  )

  const [selection, setSelection] = useState<{
    x: number
    y: number
    locator: ReadiumLocator
  } | null>(null)

  const dispatch = useAppDispatch()

  const insets = useSafeAreaInsets()

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

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: background },
        {
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      <Tabs.Screen options={{ tabBarStyle: { display: "none" } }} />
      <ToolbarDialogs topInset={insets.top + 6} />
      {selection && (
        <SelectionMenu
          bookId={book.id}
          x={selection.x}
          y={selection.y}
          locator={selection.locator}
          existingHighlight={activeHighlight}
          onClose={() => {
            setSelection(null)
            setActiveHighlight(null)
          }}
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
          highlights={book.highlights}
          bookmarks={book.bookmarks}
          fontScale={preferences.typography.scale}
          lineHeight={preferences.typography.lineHeight}
          textAlign={preferences.typography.alignment}
          fontFamily={preferences.typography.fontFamily}
          readaloudColor={preferences.readaloudColor}
          colorTheme={{ foreground, background }}
          onHighlightTap={(event) => {
            setSelection({
              x: event.nativeEvent.x,
              y: event.nativeEvent.y,
              locator: locator,
            })
            setActiveHighlight(
              book.highlights.find(
                (highlight) => highlight.id === event.nativeEvent.decoration,
              ) ?? null,
            )
          }}
          onBookmarksActivate={(event) => {
            setActiveBookmarks(event.nativeEvent.activeBookmarks)
          }}
          onLocatorChange={(event) => {
            // If this is the very first time we're mounting this
            // component, we actually want to ignore the "locator changed"
            // event, which will just be trying to reset to the beginning
            // of the currently rendered page
            if (!hasLoadedRef.current) {
              hasLoadedRef.current = true
              // Sometimes we need to pay attention to the first locator changed,
              // if we rely on it to figure out the fragments for the initial
              // locator
              if (
                !event.nativeEvent.locations?.fragments ||
                locator.locations?.fragments
              ) {
                return
              }
            }
            dispatch(
              bookshelfSlice.actions.bookRelocated({
                bookId: book.id,
                locator: { locator: event.nativeEvent, timestamp: Date.now() },
              }),
            )
          }}
          onMiddleTouch={() => {
            setShowInterface((p) => !p)
          }}
          onDoubleTouch={(event) => {
            dispatch(
              bookshelfSlice.actions.bookDoubleTapped({
                bookId: book.id,
                locator: { locator: event.nativeEvent, timestamp: Date.now() },
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
              top: insets.top + 6,
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
    flexDirection: "row",
    position: "absolute",
    right: 12,
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
