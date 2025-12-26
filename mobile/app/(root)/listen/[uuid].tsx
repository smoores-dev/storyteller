import { skipToken } from "@reduxjs/toolkit/query"
import { File } from "expo-file-system"
import { router, useLocalSearchParams } from "expo-router"
import {
  ChevronDown,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
} from "lucide-react-native"
import { useEffect, useMemo, useRef, useState } from "react"
import { View } from "react-native"
import TrackPlayer from "react-native-track-player"

import { seekBackward, seekForward } from "@/audio/PlaybackService"
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
import { formatTime, useAudioBook } from "@/hooks/useAudioBook"
import { areLocatorsEqual } from "@/modules/readium"
import { playerPositionSeeked } from "@/store/actions"
import { useAppDispatch } from "@/store/appState"
import { useGetBookBookmarksQuery, useGetBookQuery } from "@/store/localApi"
import { getLocalBookExtractedUrl } from "@/store/persistence/files"
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
  const { isLoading, track, remainingTime, rate, tracks } = useAudioBook()
  const trackPositionRef = useRef(track.position)
  trackPositionRef.current = track.position

  const panning = useRef(false)
  const [eagerProgress, setEagerProgress] = useState(track.position)

  useEffect(() => {
    if (!panning.current) {
      setEagerProgress(trackPositionRef.current)
    }
  }, [track.position, locator])

  const progressTime = useMemo(() => {
    return formatTime(eagerProgress / rate)
  }, [eagerProgress, rate])

  const remainingProgressTime = useMemo(() => {
    return "-" + formatTime((track.endPosition - eagerProgress) / rate)
  }, [eagerProgress, rate, track.endPosition])

  useEffect(() => {
    dispatch(bookshelfSlice.actions.bookOpened({ bookUuid: uuid, format }))
  }, [dispatch, format, uuid])

  const directory = getLocalBookExtractedUrl(uuid, format)

  const listing =
    format === "audiobook"
      ? book?.audiobook?.manifest?.toc
      : book?.readaloud?.audioManifest?.toc

  const chapterTitle = listing
    ?.flatMap(({ children, ...item }) => [item, ...(children ?? [])])
    .map(({ href, title }) => {
      const [urlPath, startPositionString] = href.split("#t=")
      const startPosition = parseInt(startPositionString ?? "0", 10)

      return {
        href,
        url: new File(directory, urlPath!).uri,
        startPosition,
        title,
      }
    })
    .find(({ url, startPosition }, index, array) => {
      const encodedCurrentUrl = encodeURI(
        (tracks[track.index]?.url as string | undefined) ?? "",
      )
      const next = array[index + 1]
      return (
        url === encodedCurrentUrl &&
        track.position >= startPosition &&
        (encodedCurrentUrl !== next?.url ||
          !next ||
          track.position < next.startPosition)
      )
    })?.title

  if (!book) return null

  return (
    <View className="android:pt-safe relative flex-1">
      <PortalHost>
        <View className="w-full flex-row items-center justify-between px-4 pb-2 pt-3">
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
              start={track.startPosition}
              stop={track.endPosition}
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
            <Text className="text-xs text-muted-foreground">
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
                TrackPlayer.skipToPrevious()
              }}
            >
              <Icon as={SkipBack} size={32} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onPress={() => {
                seekBackward(15)
              }}
            >
              <Icon as={RotateCcw} size={32} />
            </Button>
            <PlayPause size={80} />
            <Button
              variant="ghost"
              size="icon"
              onPress={() => {
                seekForward(15)
              }}
            >
              <Icon as={RotateCw} size={32} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onPress={() => {
                TrackPlayer.skipToNext()
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
