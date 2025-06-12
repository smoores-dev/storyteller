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
import { MiniPlayer } from "./MiniPlayer"
import { useAudioBook } from "../hooks/useAudioBook"
import { Toolbar } from "./Toolbar"
import { ToolbarDialogs } from "./ToolbarDialogs"
import { useAppDispatch, useAppSelector } from "../store/appState"
import { SelectionMenu } from "./SelectionMenu"
import { useColorTheme } from "../hooks/useColorTheme"
import {
  getFilledBookPreferences,
  getGlobalPreferences,
} from "../store/selectors/preferencesSelectors"
import { Group } from "./ui/Group"
import { ChevronLeft } from "lucide-react-native"
import { spacing } from "./ui/tokens/spacing"
import { SubtlePlayPause } from "./SubtlePlayPause"
import { deepEquals } from "../deepEquals"

type Props = {
  book: BookshelfBook
  locator: ReadiumLocator
}

export function Epub({ book, locator }: Props) {
  useKeepAwake()

  // Track whether the locator came from the EPUB view.
  // This allows us to disable automatic rewind when the
  // user presses play after swiping to a new page, which
  // would "rewind" to the previous page and be jarring.
  const locatorRef = useRef<ReadiumLocator | null>(null)
  const locatorIsFromEpub = locatorRef.current === locator

  const mountedTimeRef = useRef(Date.now())

  const hasLoadedRef = useRef(false)
  const { foreground, background } = useColorTheme()
  const [activeBookmarks, setActiveBookmarks] = useState<ReadiumLocator[]>([])
  const [activeHighlight, setActiveHighlight] = useState<Highlight | null>(null)
  const preferences = useAppSelector((state) =>
    getFilledBookPreferences(state, book.id),
  )
  const { customFonts } = useAppSelector(getGlobalPreferences)

  const [selection, setSelection] = useState<{
    x: number
    y: number
    locator: ReadiumLocator
  } | null>(null)

  const dispatch = useAppDispatch()

  const insets = useSafeAreaInsets()

  const [showInterface, setShowInterface] = useState(true)
  const epubViewRef = useRef<EPUBViewRef | null>(null)

  const { isPlaying } = useAudioBook()

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
      <ToolbarDialogs mode="text" topInset={insets.top + 6} />
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
          customFonts={customFonts}
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
            if (isPlaying) {
              return
            }

            // This callback fires multiple times upon component mount, which
            // is why it contains so many guards to prevent updating the locator
            // timestamp erroneously. Only playing the audiobook or manually
            // relocating should result in the timestamp being updated.
            if (
              locator.href === event.nativeEvent.href &&
              deepEquals(locator.locations, event.nativeEvent.locations)
            ) {
              return
            }

            // Sometimes we need to pay attention to the first locator changed,
            // if we rely on it to figure out the fragments for the initial
            // locator.
            const eventDoesNotProvideMissingFragments =
              !event.nativeEvent.locations?.fragments ||
              locator.locations?.fragments

            // If this is the very first time we're mounting this
            // component, we actually want to ignore the "locator changed"
            // event, which will just be trying to reset to the beginning
            // of the currently rendered page
            if (!hasLoadedRef.current) {
              hasLoadedRef.current = true
              if (eventDoesNotProvideMissingFragments) {
                return
              }
            }

            // If this component just mounted, we want to ignore locator changes
            // for a period of time after mounting because it will thrash around
            // attempting to reset to the beginning of the currently rendered page which
            // would cause the timestamp to get updated and break syncing.
            // However, if the event contains missing fragments, then we allow
            // dispatching to proceed even during the unstable period where
            // readium is thrashing.
            //
            // I've only observed the thrashing on Android.
            if (
              Platform.OS === "android" &&
              Date.now() - mountedTimeRef.current < 1000 &&
              eventDoesNotProvideMissingFragments
            ) {
              return
            }

            locatorRef.current = event.nativeEvent
            dispatch(
              bookshelfSlice.actions.bookRelocated({
                bookId: book.id,
                locator: {
                  locator: event.nativeEvent,
                  timestamp: Date.now(),
                },
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
      {showInterface ? (
        <>
          <Group style={[styles.backButton, { top: insets.top + 6 }]}>
            <Link href="/" replace asChild>
              <Pressable hitSlop={20}>
                <ChevronLeft color={foreground} />
              </Pressable>
            </Link>
            <Toolbar mode="text" activeBookmarks={activeBookmarks} />
          </Group>
          <MiniPlayer book={book} automaticRewind={!locatorIsFromEpub} />
        </>
      ) : (
        <SubtlePlayPause automaticRewind={!locatorIsFromEpub} />
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
    bottom: 70,
    left: 0,
    right: 0,
    zIndex: 1,
    ...(Platform.OS === "android" && { paddingVertical: 36 }),
  },
  epub: { flex: 1 },
  backButton: {
    left: spacing[2],
    justifyContent: "space-between",
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    right: spacing[2],
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
