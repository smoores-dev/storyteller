import deepmerge from "deepmerge"
import Constants from "expo-constants"
import { useKeepAwake } from "expo-keep-awake"
import { Link, Tabs } from "expo-router"
import { ChevronLeft } from "lucide-react-native"
import { useEffect, useMemo, useRef, useState } from "react"
import { DeviceEventEmitter, Platform, StatusBar, View } from "react-native"

import { type Bookmark } from "@/database/bookmarks"
import { type BookWithRelations } from "@/database/books"
import { deepEquals } from "@/deepEquals"
import { useAudioBook } from "@/hooks/useAudioBook"
import { useColorTheme } from "@/hooks/useColorTheme"
import { EPUBView } from "@/modules/readium"
import {
  type EPUBViewRef,
  type ReadiumLocator,
} from "@/modules/readium/src/Readium.types"
import { bookDoubleTapped, bookLocatorChanged } from "@/store/actions"
import { useAppDispatch } from "@/store/appState"
import {
  useGetBookBookmarksQuery,
  useGetBookHighlightsQuery,
  useGetBookPreferencesQuery,
  useGetGlobalPreferencesQuery,
  useUpdateGlobalPreferenceMutation,
} from "@/store/localApi"
import { getCustomFontUrl } from "@/store/persistence/fonts"
import { type UUID } from "@/uuid"

import { LoadingView } from "./LoadingView"
import { MiniPlayer } from "./MiniPlayer"
import { SelectionMenu } from "./SelectionMenu"
import { Toolbar } from "./Toolbar"
import { Group } from "./ui/Group"
import { HideableView } from "./ui/HideableView"
import { Button } from "./ui/button"
import { Icon } from "./ui/icon"

type Props = {
  book: BookWithRelations
  format: "readaloud" | "ebook"
  locator: ReadiumLocator
}

const forwardNavKeyCodes = [93]
const backwardNavKeyCodes = [92]

export function Epub({ book, format, locator }: Props) {
  useKeepAwake()

  const [firstRender, setFirstRender] = useState(true)

  // Track whether the locator came from the EPUB view.
  // This allows us to disable automatic rewind when the
  // user presses play after swiping to a new page, which
  // would "rewind" to the previous page and be jarring.
  const locatorRef = useRef<ReadiumLocator | null>(null)
  const locatorIsFromEpub = locatorRef.current === locator

  const { foreground, background } = useColorTheme()
  const [activeBookmarks, setActiveBookmarks] = useState<Bookmark[]>([])
  const [activeHighlight, setActiveHighlight] = useState<UUID | null>(null)

  const {
    data: bookPreferences,
    isLoading: isLoadingBookPreferences,
    isUninitialized: isBookPreferencesUnitialized,
  } = useGetBookPreferencesQuery({ uuid: book.uuid })

  const {
    data: globalPreferences,
    isLoading: isLoadingGlobalPreferences,
    isUninitialized: isGlobalPreferencesUninitialized,
  } = useGetGlobalPreferencesQuery()

  const [updateGlobalPreference] = useUpdateGlobalPreferenceMutation()

  const isLoadingPreferences =
    isLoadingBookPreferences || isLoadingGlobalPreferences
  const isPreferencesUninitialized =
    isBookPreferencesUnitialized || isGlobalPreferencesUninitialized

  const preferences = useMemo(
    () =>
      bookPreferences
        ? globalPreferences && deepmerge(globalPreferences, bookPreferences)
        : globalPreferences,
    [globalPreferences, bookPreferences],
  )
  const hideStatusbar = preferences?.hideStatusbar

  const { data: highlights } = useGetBookHighlightsQuery({
    bookUuid: book.uuid,
  })

  const { data: bookmarks } = useGetBookBookmarksQuery({
    bookUuid: book.uuid,
  })

  const customFonts = preferences?.customFonts

  const [selection, setSelection] = useState<{
    x: number
    y: number
    locator: ReadiumLocator
  } | null>(null)
  const [toolbarHeight, setToolbarHeight] = useState(0)

  const dispatch = useAppDispatch()

  useEffect(() => {
    if (!hideStatusbar?.enabled) return

    StatusBar.setHidden(!preferences?.showReaderUi)

    return () => {
      StatusBar.setHidden(false)
    }
  }, [hideStatusbar?.enabled, preferences?.showReaderUi])

  const epubViewRef = useRef<EPUBViewRef | null>(null)

  const { isPlaying } = useAudioBook()

  useEffect(() => {
    const listener = DeviceEventEmitter.addListener(
      "storyteller:keydown",
      (event) => {
        if (forwardNavKeyCodes.includes(event.keyCode)) {
          epubViewRef.current?.goForward()
        } else if (backwardNavKeyCodes.includes(event.keyCode)) {
          epubViewRef.current?.goBackward()
        }
      },
    )

    return () => listener.remove()
  }, [])

  if (isLoadingPreferences || isPreferencesUninitialized) {
    return (
      <View className="bg-background flex-1">
        <LoadingView />
      </View>
    )
  }

  return (
    <View className="bg-background flex-1">
      <Tabs.Screen options={{ tabBarStyle: { display: "none" } }} />
      <HideableView hidden={!preferences?.showReaderUi}>
        <Group
          className="z-3 flex-row items-center justify-between px-4"
          style={{
            paddingTop: Constants.statusBarHeight,
          }}
          onLayout={(event) => {
            setToolbarHeight(event.nativeEvent.layout.height)
          }}
        >
          <Link href="/" replace asChild>
            <Button variant="ghost" size="icon">
              <Icon as={ChevronLeft} size={24} />
            </Button>
          </Link>
          <Toolbar mode="text" activeBookmarks={activeBookmarks} />
        </Group>
      </HideableView>
      {selection && (
        <SelectionMenu
          bookUuid={book.uuid}
          x={selection.x}
          y={selection.y + toolbarHeight}
          locator={selection.locator}
          existingHighlight={activeHighlight}
          onClose={() => {
            setSelection(null)
            setActiveHighlight(null)
          }}
        />
      )}
      <View className="z-1 flex-1">
        <EPUBView
          ref={epubViewRef}
          style={{ flex: 1 }}
          bookUuid={book.uuid}
          locator={firstRender && Platform.OS === "android" ? null : locator}
          highlights={highlights ?? []}
          bookmarks={bookmarks?.map((bookmark) => bookmark.locator) ?? []}
          fontScale={preferences?.typography?.scale}
          lineHeight={preferences?.typography?.lineHeight}
          textAlign={preferences?.typography?.alignment}
          fontFamily={preferences?.typography?.fontFamily}
          readaloudColor={preferences?.readaloudColor}
          colorTheme={{ foreground, background }}
          customFonts={customFonts?.map((font) => ({
            ...font,
            uri: getCustomFontUrl(font.filename),
          }))}
          onHighlightTap={(event) => {
            setSelection({
              x: event.nativeEvent.x,
              y: event.nativeEvent.y,
              locator: locator,
            })
            setActiveHighlight(event.nativeEvent.decoration)
          }}
          onBookmarksActivate={(event) => {
            const activeLocators = event.nativeEvent.activeBookmarks
            setActiveBookmarks(
              bookmarks?.filter((bookmark) =>
                activeLocators.some((locator) => {
                  const { target: _, ...bookmarkLocator } = bookmark.locator
                  return deepEquals(bookmarkLocator, locator)
                }),
              ) ?? [],
            )
          }}
          onLocatorChange={(event) => {
            // UUGGHHHH this is a terrible hack
            // Opening a book for the first time
            // works. Each subsequent attempt to
            // render the EpubView for a book
            // after the first time results in an
            // empty pager view. However, re-rendering
            // the EpubView with a new locator
            // (... in a setTimeout, for some reason)
            // fixes the issue.
            if (firstRender && Platform.OS === "android") {
              setTimeout(() => {
                setFirstRender(false)
              })
              return
            }

            if (isPlaying) {
              return
            }

            locatorRef.current = event.nativeEvent
            dispatch(
              bookLocatorChanged({
                bookUuid: book.uuid,
                locator: event.nativeEvent,
                timestamp: Date.now(),
              }),
            )
          }}
          onMiddleTouch={() => {
            updateGlobalPreference({
              name: "showReaderUi",
              value: !preferences?.showReaderUi,
            })
          }}
          onDoubleTouch={(event) => {
            dispatch(
              bookDoubleTapped({
                bookUuid: book.uuid,
                locator: event.nativeEvent,
                timestamp: Date.now(),
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
      <MiniPlayer
        hidden={!preferences?.showReaderUi}
        book={book}
        format={format}
        automaticRewind={!locatorIsFromEpub}
      />
    </View>
  )
}
