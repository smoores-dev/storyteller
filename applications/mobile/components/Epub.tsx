import deepmerge from "deepmerge"
import { useKeepAwake } from "expo-keep-awake"
import { Tabs, useRouter } from "expo-router"
import { useVerticalBarEdgeIOS } from "expo-status-bar"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  DeviceEventEmitter,
  StatusBar,
  TouchableOpacity,
  View,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { type Bookmark } from "@/database/bookmarks"
import { type BookWithRelations } from "@/database/books"
import { deepEquals } from "@/deepEquals"
import { useColorTheme } from "@/hooks/useColorTheme"
import { useSpansFold } from "@/lib/pose"
import { cn } from "@/lib/utils"
import { EPUBView } from "@/modules/readium"
import {
  type EPUBViewRef,
  type ReadiumLocator,
} from "@/modules/readium/src/Readium.types"
import { bookDoubleTapped, bookLocatorChanged } from "@/store/actions"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import {
  useGetBookBookmarksQuery,
  useGetBookHighlightsQuery,
  useGetBookPreferencesQuery,
  useGetGlobalPreferencesQuery,
  useUpdateGlobalPreferenceMutation,
} from "@/store/localApi"
import { getCustomFontUrl } from "@/store/persistence/fonts"
import { getIsPlaying } from "@/store/selectors/bookshelfSelectors"
import { getShouldKeepReaderAwake } from "@/store/selectors/sleepTimerSelectors"
import { bookshelfSlice } from "@/store/slices/bookshelfSlice"
import { type UUID } from "@/uuid"

import { BackButton } from "./BackButton"
import { LoadingView } from "./LoadingView"
import { MiniPlayer } from "./MiniPlayer"
import { SelectionMenu } from "./SelectionMenu"
import { Toolbar } from "./Toolbar"
import { Group } from "./ui/Group"
import { HideableView } from "./ui/HideableView"

type Props = {
  book: BookWithRelations
  format: "readaloud" | "ebook"
  locator: ReadiumLocator
}

const forwardNavKeyCodes = [93, 117]
const backwardNavKeyCodes = [92]

const barRowHeight = 52

function EpubKeepAwake() {
  useKeepAwake()
  return null
}

export function Epub({ book, format, locator }: Props) {
  const shouldKeepAwake = useAppSelector(getShouldKeepReaderAwake)

  const { foreground, background } = useColorTheme()
  const insets = useSafeAreaInsets()
  const railEdge = useVerticalBarEdgeIOS()
  const railWidth =
    railEdge === "leading"
      ? insets.left
      : railEdge === "trailing"
        ? insets.right
        : 0
  const rail = railEdge !== null && railWidth > 0
  const inlineBar = useSpansFold() && !rail
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

  const isPlaying = useAppSelector(getIsPlaying)

  const floatingToolbar = preferences?.floatingToolbar

  const showingFootnote = useAppSelector(
    (state) => state.bookshelf.footnoteContent !== null,
  )

  const router = useRouter()

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
        {shouldKeepAwake && <EpubKeepAwake />}
        <LoadingView />
      </View>
    )
  }

  return (
    <View className="bg-background flex-1">
      {shouldKeepAwake && <EpubKeepAwake />}
      {showingFootnote && (
        <TouchableOpacity
          className="absolute top-0 right-0 bottom-0 left-0 z-100"
          onPress={() => {
            if (!showingFootnote) return
            router.dismiss()
          }}
        />
      )}
      <Tabs.Screen options={{ tabBarStyle: { display: "none" } }} />
      {rail ? (
        <View
          pointerEvents="box-none"
          className="absolute top-0 bottom-0 z-3 mr-1 flex-col items-center justify-end pb-26"
          style={{
            width: railWidth,
            ...(railEdge === "trailing" ? { right: 0 } : { left: 0 }),
          }}
        >
          <HideableView
            hidden={!preferences?.showReaderUi}
            className="items-center gap-1"
          >
            <BackButton />
            <Toolbar mode="text" activeBookmarks={activeBookmarks} vertical />
          </HideableView>
        </View>
      ) : (
        <HideableView hidden={!preferences?.showReaderUi} className="relative">
          <Group
            className={cn(
              "px-safe-or-4 z-3 flex-row items-center",
              inlineBar ? "gap-4" : "justify-between",
              {
                "bg-background border-b-foreground absolute right-0 left-0 border-b":
                  floatingToolbar,
              },
            )}
            style={{
              paddingTop: inlineBar
                ? Math.max(0, insets.top - barRowHeight)
                : insets.top,
            }}
            onLayout={(event) => {
              setToolbarHeight(event.nativeEvent.layout.height)
            }}
          >
            <BackButton />
            <Toolbar mode="text" activeBookmarks={activeBookmarks} />
          </Group>
        </HideableView>
      )}
      {selection && (
        <SelectionMenu
          bookUuid={book.uuid}
          x={selection.x + insets.left}
          y={selection.y + (floatingToolbar ? insets.top : toolbarHeight)}
          locator={selection.locator}
          existingHighlight={activeHighlight}
          onClose={() => {
            setSelection(null)
            setActiveHighlight(null)
          }}
        />
      )}
      <View
        className={cn("z-1 flex-1", {
          "pb-safe-or-2": floatingToolbar,
        })}
        style={{
          backgroundColor: background,
          paddingLeft: insets.left,
          paddingRight: insets.right,
          ...(floatingToolbar
            ? {
                paddingTop: insets.top,
              }
            : {
                paddingTop: 24,
              }),
        }}
      >
        <EPUBView
          ref={epubViewRef}
          style={{ flex: 1 }}
          bookUuid={book.uuid}
          locator={locator}
          highlights={highlights ?? []}
          bookmarks={bookmarks?.map((bookmark) => bookmark.locator) ?? []}
          fontScale={preferences?.typography?.scale}
          lineHeight={preferences?.typography?.lineHeight}
          textAlign={preferences?.typography?.alignment}
          fontFamily={preferences?.typography?.fontFamily}
          marginLeft={preferences?.layout.marginLeft}
          marginRight={preferences?.layout.marginRight}
          readaloudColor={preferences?.readaloudColor}
          readaloudDecoratorStyle={preferences?.readaloudDecoratorStyle}
          scrollMode={preferences?.layout.scroll ?? false}
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
            if (isPlaying) {
              return
            }

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
          onShowFootnote={(event) => {
            dispatch(
              bookshelfSlice.actions.footnoteOpened({
                content: event.nativeEvent.content,
              }),
            )
          }}
          isPlaying={isPlaying}
        />
      </View>
      <MiniPlayer
        floatingToolbar={floatingToolbar ?? false}
        hidden={!preferences?.showReaderUi}
        book={book}
        format={format}
      />
    </View>
  )
}
