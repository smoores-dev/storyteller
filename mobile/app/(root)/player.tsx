import { router } from "expo-router"
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native"
import { ScrollView } from "react-native-gesture-handler"
import { ChevronDownIcon } from "../../icons/ChevronDownIcon"
import { useAppDispatch, useAppSelector } from "../../store/appState"
import { UIText } from "../../components/UIText"
import { HeaderText } from "../../components/HeaderText"
import { useEffect, useMemo, useRef, useState } from "react"
import TrackPlayer, {
  useTrackPlayerEvents,
  Event,
} from "react-native-track-player"
import { ProgressBar } from "../../components/ProgressBar"
import { useAudioBook } from "../../hooks/useAudioBook"
import { PlayPause } from "../../components/PlayPause"
import { PrevIcon } from "../../icons/PrevIcon"
import { NextIcon } from "../../icons/NextIcon"
import { JumpBackwardFifteenIcon } from "../../icons/JumpBackwardFifteenIcon"
import { JumpForwardFifteenIcon } from "../../icons/JumpForwardFifteenIcon"
import {
  getCurrentlyPlayingBook,
  getLocator,
} from "../../store/selectors/bookshelfSelectors"
import { getLocalAudioBookCoverUrl } from "../../store/persistence/files"
import { LoadingView } from "../../components/LoadingView"
import { Toolbar } from "../../components/Toolbar"
import { ToolbarDialogs } from "../../components/ToolbarDialogs"
import { areLocatorsEqual } from "../../modules/readium"
import { isSameChapter } from "../../links"
import { seekBackward, seekForward } from "../../audio/PlaybackService"
import { debounce } from "../../debounce"
import { playerPositionSeeked } from "../../store/slices/bookshelfSlice"
import { spacing } from "../../components/ui/tokens/spacing"
import { useColorTheme } from "../../hooks/useColorTheme"
import { fontSizes } from "../../components/ui/tokens/fontSizes"

const events = [Event.PlaybackState, Event.PlaybackActiveTrackChanged]

export default function PlayerScreen() {
  const dimensions = useWindowDimensions()
  const book = useAppSelector(getCurrentlyPlayingBook)
  const timestampedLocator = useAppSelector(
    (state) => book && getLocator(state, book.id),
  )
  const { foregroundSecondary } = useColorTheme()

  const locator = timestampedLocator?.locator
  const activeBookmarks = useMemo(
    () =>
      locator && book
        ? book.bookmarks.filter((bookmark) =>
            areLocatorsEqual(bookmark, locator),
          )
        : [],
    [book, locator],
  )
  const [currentTrack, setCurrentTrack] = useState(1)
  const [trackCount, setTrackCount] = useState(1)

  const dispatch = useAppDispatch()
  const { isLoading, isPlaying, track, remainingTime } = useAudioBook()
  const trackPositionRef = useRef(track.position)
  trackPositionRef.current = track.position

  const [eagerProgress, setEagerProgress] = useState(track.position)

  const syncEagerProgress = useMemo(() => {
    return debounce(() => {
      setEagerProgress(trackPositionRef.current)
    }, 200)
  }, [])

  useEffect(() => {
    syncEagerProgress()
    return () => {
      syncEagerProgress.cancel()
    }
  }, [track.position, locator, syncEagerProgress])

  const progressTime = useMemo(() => {
    const relativeProgress = track.position - track.startPosition
    const minutes = Math.floor(relativeProgress / 60)
    const seconds = Math.floor(relativeProgress - minutes * 60)
      .toString()
      .padStart(2, "0")
    return `${minutes}:${seconds}`
  }, [track.position, track.startPosition])

  const remainingProgressTime = useMemo(() => {
    const remainingProgress = track.endPosition - track.position
    const minutes = Math.floor(remainingProgress / 60)
    const seconds = Math.floor(remainingProgress - minutes * 60)
      .toString()
      .padStart(2, "0")
    return `-${minutes}:${seconds}`
  }, [track.endPosition, track.position])

  useTrackPlayerEvents(events, async () => {
    setCurrentTrack(((await TrackPlayer.getActiveTrackIndex()) ?? 0) + 1)
    setTrackCount((await TrackPlayer.getQueue()).length)
  })

  useEffect(() => {
    async function updateStats() {
      setCurrentTrack(((await TrackPlayer.getActiveTrackIndex()) ?? 0) + 1)
      setTrackCount((await TrackPlayer.getQueue()).length)
    }

    updateStats()
  }, [])

  const chapterTitle = useMemo(() => {
    if (!book?.manifest.toc) return undefined

    for (const link of book.manifest.toc) {
      if (isSameChapter(link.href, locator?.href ?? "")) {
        return link.title
      }
      if (!link.children) continue
      for (const childLink of link.children) {
        if (isSameChapter(childLink.href, locator?.href ?? "")) {
          return childLink.title
        }
      }
    }
    return undefined
  }, [book?.manifest.toc, locator?.href])

  if (!book) return null

  return (
    <View style={styles.container}>
      <ToolbarDialogs
        mode="audio"
        topInset={Platform.OS === "android" ? 24 : 0}
      />
      <View style={styles.topbar}>
        <Pressable
          hitSlop={20}
          onPress={() => {
            router.back()
          }}
        >
          <ChevronDownIcon />
        </Pressable>
        <Toolbar mode="audio" activeBookmarks={activeBookmarks} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Native modals have dark backgrounds on iOS, set the status bar to light content. */}
        {/* <StatusBar style="light" /> */}
        {isLoading && <LoadingView />}
        <Image
          style={[
            styles.cover,
            {
              width: Math.min(
                dimensions.width - spacing[3],
                dimensions.height - 520,
              ),
            },
          ]}
          source={{ uri: getLocalAudioBookCoverUrl(book.id) }}
        />
        <View style={styles.details}>
          <HeaderText numberOfLines={2} style={styles.title}>
            {book.title}
          </HeaderText>
          <UIText
            numberOfLines={1}
            style={[{ color: foregroundSecondary }, styles.parts]}
          >
            {chapterTitle}
          </UIText>
        </View>
        <View style={styles.progressBarWrapper}>
          <UIText style={styles.trackCount}>
            Track {currentTrack} of {trackCount}
          </UIText>
          <ProgressBar
            start={track.startPosition}
            stop={track.endPosition}
            progress={eagerProgress}
            onProgressChange={(newProgress) => {
              setEagerProgress(newProgress)
              dispatch(playerPositionSeeked({ progress: newProgress }))
            }}
          />
        </View>
        <View style={styles.timeDetails}>
          <UIText style={styles.progressTime}>{progressTime}</UIText>
          <UIText style={styles.totalTimeLeft}>{remainingTime} left</UIText>
          <UIText style={styles.remainingProgressTime}>
            {remainingProgressTime}
          </UIText>
        </View>
        <View style={styles.playerControls}>
          <Pressable
            onPress={() => {
              TrackPlayer.skipToPrevious()
            }}
          >
            <PrevIcon />
          </Pressable>
          <Pressable
            onPress={() => {
              seekBackward(15)
            }}
          >
            <JumpBackwardFifteenIcon />
          </Pressable>
          <PlayPause style={styles.playPause} isPlaying={isPlaying} />
          <Pressable
            onPress={() => {
              seekForward(15)
            }}
          >
            <JumpForwardFifteenIcon />
          </Pressable>
          <Pressable
            onPress={() => {
              TrackPlayer.skipToNext()
            }}
          >
            <NextIcon />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    alignItems: "center",
  },
  topbar: {
    paddingTop: 12,
    paddingBottom: 8,
    paddingHorizontal: 18,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cover: {
    marginVertical: spacing[2],
    marginHorizontal: "auto",
    aspectRatio: 1,
    borderRadius: 4,
  },
  trackCount: {
    alignSelf: "center",
    ...(Platform.OS === "android" && {
      marginBottom: 12,
    }),
  },
  details: {
    width: "100%",
    paddingTop: 24,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 22,
    marginBottom: 8,
  },
  parts: {
    ...fontSizes.base,
    marginBottom: 16,
  },
  progressBarWrapper: {
    width: "100%",
    paddingHorizontal: 24,
    ...(Platform.OS === "android" && {
      marginBottom: 8,
    }),
  },
  playerControls: {
    marginTop: 24,
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 24,
    gap: 24,
  },
  playPause: {
    width: 80,
    height: 80,
  },
  timeDetails: {
    width: "100%",
    paddingHorizontal: 24,
    paddingVertical: 4,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressTime: {
    width: 60,
    fontSize: 12,
    fontWeight: "bold",
  },
  totalTimeLeft: {
    fontSize: 12,
  },
  remainingProgressTime: {
    width: 60,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "bold",
  },
})
