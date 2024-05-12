import { Link, router } from "expo-router"
import { Image, Platform, Pressable, StyleSheet, View } from "react-native"
import { ChevronDownIcon } from "../../icons/ChevronDownIcon"
import { useAppSelector } from "../../store/appState"
import { UIText } from "../../components/UIText"
import { HeaderText } from "../../components/HeaderText"
import { useEffect, useMemo, useState } from "react"
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

const events = [Event.PlaybackState, Event.PlaybackTrackChanged]

export default function PlayerScreen() {
  const book = useAppSelector(getCurrentlyPlayingBook)
  const locator = useAppSelector((state) => book && getLocator(state, book.id))
  const [currentTrack, setCurrentTrack] = useState(1)
  const [trackCount, setTrackCount] = useState(1)

  const {
    isLoading,
    isPlaying,
    progress,
    startPosition,
    endPosition,
    remainingTime,
  } = useAudioBook()

  const progressTime = useMemo(() => {
    const relativeProgress = progress - startPosition
    const minutes = Math.floor(relativeProgress / 60)
    const seconds = Math.floor(relativeProgress - minutes * 60)
      .toString()
      .padStart(2, "0")
    return `${minutes}:${seconds}`
  }, [progress, startPosition])

  const remainingProgressTime = useMemo(() => {
    const remainingProgress = endPosition - progress
    const minutes = Math.floor(remainingProgress / 60)
    const seconds = Math.floor(remainingProgress - minutes * 60)
      .toString()
      .padStart(2, "0")
    return `-${minutes}:${seconds}`
  }, [endPosition, progress])

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

  const isPresented = router.canGoBack()

  if (!book) return null

  const title = book.manifest.toc?.find(
    (link) => link.href === locator?.href,
  )?.title

  return (
    <View style={styles.container}>
      {/* Native modals have dark backgrounds on iOS, set the status bar to light content. */}
      {/* <StatusBar style="light" /> */}
      {isLoading && <LoadingView />}
      <ToolbarDialogs />
      <View style={styles.topbar}>
        {isPresented ? (
          <Pressable
            hitSlop={20}
            onPress={() => {
              router.back()
            }}
          >
            <ChevronDownIcon />
          </Pressable>
        ) : (
          <Link href="/">
            <ChevronDownIcon />
          </Link>
        )}
        <Toolbar mode="audio" />
      </View>
      <Image
        style={styles.cover}
        source={{ uri: getLocalAudioBookCoverUrl(book.id) }}
      />
      <View style={styles.details}>
        <HeaderText numberOfLines={2} style={styles.title}>
          {book.title}
        </HeaderText>
        <UIText style={styles.parts}>{title}</UIText>
        <UIText>
          Track {currentTrack} of {trackCount}{" "}
        </UIText>
      </View>
      <View style={styles.progressBarWrapper}>
        <ProgressBar
          start={startPosition}
          stop={endPosition}
          progress={progress}
          onProgressChange={(newProgress) => {
            TrackPlayer.seekTo(newProgress)
          }}
        />
      </View>
      <View style={styles.timeDetails}>
        <UIText style={styles.progressTime}>{progressTime}</UIText>
        <UIText>{remainingTime} left</UIText>
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
          onPress={async () => {
            const currentPosition = await TrackPlayer.getPosition()
            await TrackPlayer.seekTo(currentPosition - 15)
          }}
        >
          <JumpBackwardFifteenIcon />
        </Pressable>
        <PlayPause style={styles.playPause} isPlaying={isPlaying} />
        <Pressable
          onPress={async () => {
            const currentPosition = await TrackPlayer.getPosition()
            await TrackPlayer.seekTo(currentPosition + 15)
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
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
  },
  topbar: {
    paddingTop: Platform.OS === "android" ? 48 : 12,
    paddingBottom: 8,
    paddingHorizontal: 18,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cover: {
    paddingVertical: 24,
    paddingHorizontal: 12,
    width: 324,
    height: 324,
    borderRadius: 4,
  },
  details: {
    width: "100%",
    padding: 24,
  },
  title: {
    fontSize: 28,
    marginBottom: 8,
  },
  parts: {
    fontSize: 18,
    marginBottom: 16,
  },
  progressBarWrapper: {
    width: "100%",
    paddingHorizontal: 24,
  },
  playerControls: {
    marginTop: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 24,
  },
  playPause: {
    width: 80,
    height: 80,
  },
  timeDetails: {
    width: "100%",
    paddingHorizontal: 24,
    paddingVertical: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressTime: {
    width: 60,
  },
  remainingProgressTime: {
    width: 60,
    textAlign: "right",
  },
})
