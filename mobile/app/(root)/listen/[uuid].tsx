import { skipToken } from "@reduxjs/toolkit/query"
import { router, useLocalSearchParams } from "expo-router"
import {
  ChevronDown,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
} from "lucide-react-native"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { View } from "react-native"

import { AudiobookCover } from "@/components/AudiobookCover"
import { LoadingView } from "@/components/LoadingView"
import { PlayPause } from "@/components/PlayPause"
import { ProgressBar } from "@/components/ProgressBar"
import { Toolbar } from "@/components/Toolbar"
import { AspectRatio } from "@/components/ui/aspect-ratio"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { PortalHost } from "@/components/ui/portal-context"
import { Text } from "@/components/ui/text"
import { Storyteller, areLocatorsEqual } from "@/modules/readium"
import { type ReadiumLink } from "@/modules/readium/src/Readium.types"
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
  const activeBookmarks = useMemo(
    () =>
      locator && bookmarks
        ? bookmarks.filter((bookmark) =>
            areLocatorsEqual(bookmark.locator, locator),
          )
        : [],
    [bookmarks, locator],
  )

  const dispatch = useAppDispatch()
  const isLoading = useAppSelector(getIsAudioLoading)
  const duration = useAppSelector(getCurrentTrackDuration)
  const position = useAppSelector(getPosition)
  const remainingTime = useAppSelector(getHumanFormattedRemainingTime)
  const rate = useAppSelector(getPlaybackRate)
  const panning = useRef(false)
  const [eagerProgress, setEagerProgress] = useState(position)

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
    dispatch(bookshelfSlice.actions.bookOpened({ bookUuid: uuid, format }))
  }, [dispatch, format, uuid])

  const tracks = useAppSelector(getTracks)
  const currentTrackIndex = useAppSelector(getCurrentTrackIndex)

  const fromTracks = tracks.map((track) => ({
    href: track.relativeUri + "#t=0",
    title: track.title,
  }))

  const listing =
    format === "audiobook"
      ? book?.audiobook?.manifest?.toc ?? fromTracks
      : book?.readaloud?.audioManifest?.toc ?? fromTracks

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
    ...("children" in item ? item.children ?? [] : []),
  ])

  const currentChapterIndex = chapters.findLastIndex((link) => {
    const [hrefWithoutFragment, fragment] = link.href.split("#t=")
    const readingOrderIndex = hrefToReadingOrderIndex?.[hrefWithoutFragment!]
    if (readingOrderIndex === undefined) return false
    return (
      readingOrderIndex <= currentTrackIndex &&
      parseFloat(fragment ?? "0.0") <= position + 3
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
    <View className="android:pt-safe relative flex-1">
      <PortalHost>
        <View className="w-full flex-row items-center justify-between px-4 pt-3 pb-2">
          <Button
            variant="ghost"
            size="icon"
            onPress={() => {
              router.back()
            }}
          >
            <Icon as={ChevronDown} size={24} />
          </Button>
          <Toolbar mode="audio" activeBookmarks={activeBookmarks} />
        </View>

        <View className="mb-4 h-full flex-1 items-center">
          {isLoading && <LoadingView />}
          <AspectRatio ratio={1} className="max-h-[60%] w-full px-4">
            <View className="h-full w-full flex-1 overflow-hidden rounded-xl">
              <AudiobookCover book={book} />
            </View>
          </AspectRatio>
          <View className="w-full px-6 pt-6">
            <Text variant="h4" numberOfLines={2} className="mb-2">
              {book.title}
            </Text>
            <Text numberOfLines={1} className="mb-4">
              {chapterTitle}
            </Text>
          </View>
          <View className="my-4 w-full px-6">
            <ProgressBar
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
          <View className="mt-6 grow flex-row items-center gap-6 pb-6">
            <Button
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
              variant="ghost"
              size="icon"
              onPress={() => {
                Storyteller.seekBy(15)
              }}
            >
              <Icon as={RotateCw} size={32} />
            </Button>
            <Button
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
