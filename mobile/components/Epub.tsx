import { useEffect, useRef, useState } from "react"
import { Platform, Pressable, View, useWindowDimensions } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { Link, Tabs } from "expo-router"
import { useKeepAwake } from "expo-keep-awake"
import { BookshelfBook } from "../store/slices/bookshelfSlice"
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

type Props = {
  book: BookshelfBook
  locator: ReadiumLocator
  onLocatorChange: (locator: ReadiumLocator) => void
}

export const Epub = function Epub({ book, locator, onLocatorChange }: Props) {
  useKeepAwake()
  const [activeBookmarks, setActiveBookmarks] = useState<ReadiumLocator[]>([])

  const insets = useSafeAreaInsets()

  const dimensions = useWindowDimensions()

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
      ?.findOnPage(book.bookmarks)
      .then((found) => setActiveBookmarks(found))
  }, [book.bookmarks])

  return (
    <View
      style={{
        flex: 1,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
        backgroundColor: "white",
      }}
    >
      <Tabs.Screen options={{ tabBarStyle: { display: "none" } }} />
      <ToolbarDialogs />
      <View
        style={[
          {
            position: "absolute",
            top: insets.top + 12,
            bottom: 80,
            left: 0,
            right: 0,
            zIndex: 1,
            ...(Platform.OS === "android" && { paddingVertical: 36 }),
          },
        ]}
      >
        <EPUBView
          ref={epubViewRef}
          style={{ flex: 1 }}
          bookId={book.id}
          locator={locator}
          onLocatorChange={(event) => {
            onLocatorChange(event.nativeEvent)
          }}
          onMiddleTouch={() => {
            setShowInterface((p) => !p)
          }}
          isPlaying={isPlaying}
        />
      </View>
      {showInterface && (
        <View
          style={{
            position: "absolute",
            top: insets.top,
            flexDirection: "row",
            alignItems: "center",
            zIndex: 3,
          }}
        >
          <Link href="/" asChild>
            <Pressable hitSlop={20}>
              <ChevronLeftIcon />
            </Pressable>
          </Link>
        </View>
      )}
      {showInterface && (
        <View
          style={{
            position: "absolute",
            right: 12,
            top: insets.top + 12,
            bottom: dimensions.height - insets.top - 20,
            left: 50,
            zIndex: 3,
            alignItems: "flex-end",
          }}
        >
          <Toolbar mode="text" activeBookmarks={activeBookmarks} />
        </View>
      )}
      {!showInterface ? (
        <View
          style={{
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
          }}
        >
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
          style={{
            position: "absolute",
            left: 12,
            right: 12,
            bottom: 32,
            zIndex: 3,
          }}
        />
      )}
    </View>
  )
}
