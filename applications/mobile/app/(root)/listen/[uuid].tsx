import { skipToken } from "@reduxjs/toolkit/query"
import { router, useLocalSearchParams } from "expo-router"
import { StatusBar, useVerticalBarEdgeIOS } from "expo-status-bar"
import {
  ChevronDown,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
} from "lucide-react-native"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { TouchableOpacity, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { AudiobookCover } from "@/components/AudiobookCover"
import { LoadingView } from "@/components/LoadingView"
import { PlayPause } from "@/components/PlayPause"
import { ProgressBar } from "@/components/ProgressBar"
import { Toolbar } from "@/components/Toolbar"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { PortalHost } from "@/components/ui/portal-context"
import { Text } from "@/components/ui/text"
import { useSpansFold } from "@/lib/pose"
import { cn } from "@/lib/utils"
import {
  AUDIOBOOK_TOC_LOOKAHEAD_SECONDS,
  Storyteller,
  areLocatorsEqual,
  getAudiobookLocatorPosition,
} from "@/modules/readium"
import {
  type ReadiumLink,
  type StorytellerTrack,
} from "@/modules/readium/src/Readium.types"
import { playerPositionSeeked } from "@/store/actions"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import { useGetBookBookmarksQuery, useGetBookQuery } from "@/store/localApi"
import {
  formatTime,
  getCurrentTrackDuration,
  getCurrentTrackIndex,
  getHumanFormattedRemainingTime,
  getIsAudioLoading,
  getPlaybackRate,
  getPosition,
  getTracks,
} from "@/store/selectors/bookshelfSelectors"
import { bookshelfSlice } from "@/store/slices/bookshelfSlice"
import { type UUID } from "@/uuid"

const ACTIVE_AUDIO_BOOKMARK_WINDOW_SECONDS = 2

/** The air the cover keeps around itself, which the measured square gives back. */
const coverMargin = 16

function getTrackStartPositions(tracks: StorytellerTrack[]) {
  const positions: Record<string, number> = {}
  let startPosition = 0

  for (const track of tracks) {
    positions[track.relativeUri] = startPosition
    startPosition += track.duration
  }

  return positions
}

export default function PlayerScreen() {
  const { uuid, format = "readaloud" } = useLocalSearchParams() as {
    uuid: UUID
    format?: "readaloud" | "ebook" | "audiobook"
  }

  const { data: book } = useGetBookQuery(uuid ? { uuid } : skipToken)
  const { data: bookmarks } = useGetBookBookmarksQuery(
    uuid ? { bookUuid: uuid } : skipToken,
  )
  const locator = book?.position?.locator

  const dispatch = useAppDispatch()
  const isLoading = useAppSelector(getIsAudioLoading)
  const duration = useAppSelector(getCurrentTrackDuration)
  const position = useAppSelector(getPosition)
  const remainingTime = useAppSelector(getHumanFormattedRemainingTime)
  const rate = useAppSelector(getPlaybackRate)
  const panning = useRef(false)
  const [eagerProgress, setEagerProgress] = useState(position)

  const insets = useSafeAreaInsets()
  const railEdge = useVerticalBarEdgeIOS()
  const railWidth =
    railEdge === "leading"
      ? insets.left
      : railEdge === "trailing"
        ? insets.right
        : 0
  const rail = railEdge !== null && railWidth > 0

  const [coverRegion, setCoverRegion] = useState({ height: 0, width: 0 })
  const coverSize = Math.max(
    0,
    Math.min(coverRegion.height, coverRegion.width) - coverMargin * 2,
  )

  const spansFold = useSpansFold()

  useLayoutEffect(() => {
    if (!panning.current) {
      setEagerProgress(position)
    }
  }, [position, locator])

  const progressTime = useMemo(() => {
    return formatTime(eagerProgress, rate)
  }, [eagerProgress, rate])

  const remainingProgressTime = useMemo(() => {
    return "-" + formatTime(duration - eagerProgress, rate)
  }, [eagerProgress, rate, duration])

  useEffect(() => {
    dispatch(
      bookshelfSlice.actions.playbackSpeedContextChanged({
        context: "listening",
      }),
    )
  }, [dispatch])

  useEffect(() => {
    dispatch(bookshelfSlice.actions.bookOpened({ bookUuid: uuid, format }))
  }, [dispatch, format, uuid])

  const tracks = useAppSelector(getTracks)
  const currentTrackIndex = useAppSelector(getCurrentTrackIndex)

  const trackStartPositions = useMemo(() => {
    return getTrackStartPositions(tracks)
  }, [tracks])

  const audioBookmarkPositions = useMemo(() => {
    if (!bookmarks || format !== "audiobook") return []

    return bookmarks.flatMap((bookmark) => {
      const bookmarkTrackStart = trackStartPositions[bookmark.locator.href]
      if (bookmarkTrackStart === undefined) return []

      return [
        {
          audioPosition:
            bookmarkTrackStart + getAudiobookLocatorPosition(bookmark.locator),
          bookmark,
        },
      ]
    })
  }, [bookmarks, format, trackStartPositions])

  const activeBookmarks = useMemo(() => {
    if (!bookmarks) return []

    if (format === "audiobook") {
      const currentTrack = tracks[currentTrackIndex]
      if (!currentTrack) return []

      const currentTrackStart = trackStartPositions[currentTrack.relativeUri]
      if (currentTrackStart === undefined) return []

      const currentAudioPosition = currentTrackStart + position
      const minPosition =
        currentAudioPosition - ACTIVE_AUDIO_BOOKMARK_WINDOW_SECONDS
      const maxPosition =
        currentAudioPosition + ACTIVE_AUDIO_BOOKMARK_WINDOW_SECONDS

      const activeAudioBookmarks = []
      for (const bookmarkPosition of audioBookmarkPositions) {
        if (
          bookmarkPosition.audioPosition >= minPosition &&
          bookmarkPosition.audioPosition <= maxPosition
        ) {
          activeAudioBookmarks.push(bookmarkPosition.bookmark)
        }
      }

      return activeAudioBookmarks
    }

    return locator
      ? bookmarks.filter((bookmark) =>
          areLocatorsEqual(bookmark.locator, locator),
        )
      : []
  }, [
    bookmarks,
    audioBookmarkPositions,
    currentTrackIndex,
    format,
    locator,
    position,
    trackStartPositions,
    tracks,
  ])

  const fromTracks = tracks.map((track) => ({
    href: track.relativeUri + "#t=0",
    title: track.title,
  }))

  const listing =
    format === "audiobook"
      ? (book?.audiobook?.manifest?.toc ?? fromTracks)
      : (book?.readaloud?.audioManifest?.toc ?? fromTracks)

  const readingOrder =
    format === "audiobook"
      ? book?.audiobook?.manifest?.readingOrder
      : book?.readaloud?.audioManifest?.readingOrder

  const hrefToReadingOrderIndex = readingOrder?.reduce(
    (acc, link, index) => ({ ...acc, [link.href]: index }),
    {} as Record<string, number>,
  )

  const chapters = listing.flatMap((item) => [
    item,
    ...("children" in item ? (item.children ?? []) : []),
  ])

  const currentChapterIndex = chapters.findLastIndex((link) => {
    const [hrefWithoutFragment, fragment] = link.href.split("#t=")
    const readingOrderIndex = hrefToReadingOrderIndex?.[hrefWithoutFragment!]
    if (readingOrderIndex === undefined) return false
    return (
      readingOrderIndex <= currentTrackIndex &&
      parseFloat(fragment ?? "0.0") <=
        position + AUDIOBOOK_TOC_LOOKAHEAD_SECONDS
    )
  })

  const chapterTitle =
    currentChapterIndex >= 0 ? chapters[currentChapterIndex]?.title : undefined

  const singleTrack = tracks.length === 1

  const seekToChapter = (chapter: ReadiumLink) => {
    const [relativeUri, fragment] = chapter.href.split("#t=")
    const target = parseFloat(fragment ?? "0")
    setEagerProgress(target)
    dispatch(bookshelfSlice.actions.audioPositionChanged({ position: target }))
    Storyteller.seekTo(relativeUri!, target)
  }

  if (!book) return null

  return (
    <View className="android:pt-safe relative h-full flex-1">
      <StatusBar
        verticalBarBehaviorIOS={spansFold ? "disabled" : "automatic"}
      />
      <PortalHost>
        <View
          className={cn(
            rail
              ? "absolute top-0 bottom-0 z-3 mr-1 flex-col items-center justify-end pb-26"
              : "w-full flex-row items-center justify-between px-4 pt-3 pb-2",
          )}
          pointerEvents="box-none"
          style={{
            width: rail ? railWidth : undefined,
            ...(railEdge === "trailing" ? { right: 0 } : { left: 0 }),
          }}
        >
          <TouchableOpacity
            accessibilityLabel="Minimize player"
            accessibilityRole="button"
            className="size-8 items-center justify-center"
            onPress={() => {
              router.back()
            }}
          >
            <Icon as={ChevronDown} size={24} />
          </TouchableOpacity>
          <Toolbar
            mode="audio"
            activeBookmarks={activeBookmarks}
            vertical={rail}
          />
        </View>

        <View className="pr-safe mb-4 flex-1 items-center">
          {isLoading && <LoadingView />}
          <View
            className="min-h-0 w-full grow items-center justify-center pt-2"
            onLayout={({
              nativeEvent: {
                layout: { height, width },
              },
            }) => setCoverRegion({ height, width })}
          >
            <View
              className="overflow-hidden rounded-xl"
              style={{ height: coverSize, width: coverSize }}
            >
              <AudiobookCover book={book} />
            </View>
          </View>
          <View className="w-full px-6 pt-6">
            <Text variant="h4" numberOfLines={2}>
              {book.title}
            </Text>
            <Text numberOfLines={1} className="mb-4">
              {chapterTitle}
            </Text>
          </View>
          <View className="my-4 w-full px-6">
            <ProgressBar
              accessibilityLabel="Playback position"
              start={0}
              stop={duration}
              progress={eagerProgress}
              onProgressChange={(newProgress) => {
                setEagerProgress(newProgress)
                dispatch(playerPositionSeeked({ progress: newProgress }))
              }}
              onPanStart={() => {
                panning.current = true
              }}
              onPanStop={() => {
                panning.current = false
              }}
            />
          </View>
          <View className="w-full flex-row items-center justify-between px-6 py-1">
            <Text className="w-16 text-xs font-bold">{progressTime}</Text>
            <Text className="text-muted-foreground text-xs">
              {remainingTime} left
            </Text>
            <Text className="w-16 text-right text-xs font-bold">
              {remainingProgressTime}
            </Text>
          </View>
          <View className="mt-6 flex-row items-center gap-6 pb-6">
            <Button
              accessibilityLabel="Previous track"
              variant="ghost"
              size="icon"
              onPress={() => {
                if (singleTrack && currentChapterIndex >= 0) {
                  const current = chapters[currentChapterIndex]!
                  const startPos = parseFloat(
                    current.href.split("#t=")[1] ?? "0",
                  )
                  if (position - startPos > 3) {
                    seekToChapter(current)
                  } else if (currentChapterIndex > 0) {
                    seekToChapter(chapters[currentChapterIndex - 1]!)
                  } else {
                    seekToChapter(current)
                  }
                } else {
                  Storyteller.prev()
                }
              }}
            >
              <Icon as={SkipBack} size={32} />
            </Button>
            <Button
              accessibilityLabel="Rewind 15 seconds"
              variant="ghost"
              size="icon"
              onPress={() => {
                Storyteller.seekBy(-15)
              }}
            >
              <Icon as={RotateCcw} size={32} />
            </Button>
            <PlayPause size={80} />
            <Button
              accessibilityLabel="Forward 30 seconds"
              variant="ghost"
              size="icon"
              onPress={() => {
                Storyteller.seekBy(30)
              }}
            >
              <Icon as={RotateCw} size={32} />
            </Button>
            <Button
              accessibilityLabel="Next track"
              variant="ghost"
              size="icon"
              onPress={() => {
                if (
                  singleTrack &&
                  currentChapterIndex >= 0 &&
                  currentChapterIndex < chapters.length - 1
                ) {
                  seekToChapter(chapters[currentChapterIndex + 1]!)
                } else {
                  Storyteller.next()
                }
              }}
            >
              <Icon as={SkipForward} size={32} />
            </Button>
          </View>
        </View>
      </PortalHost>
    </View>
  )
}
