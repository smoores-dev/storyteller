import { useEffect, useMemo, useState } from "react"
import TrackPlayer, {
  Event,
  usePlaybackState,
  State,
  useProgress,
  useTrackPlayerEvents,
} from "react-native-track-player"
import { useAppSelector } from "../store/appState"
import { getIsAudioLoading } from "../store/selectors/bookshelfSelectors"
import { BookshelfTrack } from "../store/slices/bookshelfSlice"

const events = [Event.PlaybackState, Event.PlaybackActiveTrackChanged]

export function formatTime(time: number) {
  const hours = Math.floor(time / 3600)
  const minutes = Math.floor(time / 60 - hours * 60)
  const seconds = Math.floor(time - hours * 3600 - minutes * 60)
    .toString()
    .padStart(2, "0")
  if (hours) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds}`
  }
  return `${minutes}:${seconds}`
}

export function useAudioBook() {
  const isLoading = useAppSelector(getIsAudioLoading)

  const [currentTrackIndex, setCurrentTrackIndex] = useState(0)
  const [tracks, setTracks] = useState<BookshelfTrack[]>([])

  useTrackPlayerEvents(events, async () => {
    setCurrentTrackIndex((await TrackPlayer.getActiveTrackIndex()) ?? 0)
    setTracks((await TrackPlayer.getQueue()) as BookshelfTrack[])
  })

  useEffect(() => {
    async function updateStats() {
      setCurrentTrackIndex((await TrackPlayer.getActiveTrackIndex()) ?? 0)
      setTracks((await TrackPlayer.getQueue()) as BookshelfTrack[])
    }

    updateStats()
  }, [])

  const currentTrack = tracks[currentTrackIndex]

  const { position, duration } = useProgress()

  const { state: playerState } = usePlaybackState()
  const isPlaying = playerState === State.Playing

  const total = useMemo(() => {
    return tracks.reduce((acc, track) => acc + (track.duration ?? 0), 0)
  }, [tracks])

  const remaining = useMemo(() => {
    if (!currentTrack) return 0

    const remainingTracks = tracks.slice(currentTrackIndex + 1)
    return (
      remainingTracks.reduce((acc, track) => acc + (track.duration ?? 0), 0) +
      (currentTrack.duration ?? 0) -
      position
    )
  }, [currentTrack, currentTrackIndex, position, tracks])

  const percentComplete = Math.round(((total - remaining) / total) * 100)
  const remainingHours = Math.floor(remaining / 3600)
  const remainingMinutes = Math.floor(remaining / 60 - remainingHours * 60)
  const remainingTime = `${remainingHours} hours ${remainingMinutes} minutes`

  return {
    isLoading,
    progress: position,
    isPlaying,
    trackCount: tracks.length,
    tracks,
    startPosition: 0,
    endPosition: duration,
    percentComplete: percentComplete,
    remainingTime: remainingTime,
    track: {
      index: currentTrackIndex,
      position,
      startPosition: 0,
      endPosition: duration,
      percentComplete: Math.round((position / duration) * 100),
      formattedPosition: useMemo(() => formatTime(position), [position]),
      formattedStartPosition: useMemo(() => formatTime(0), []),
      formattedEndPosition: useMemo(() => formatTime(duration), [duration]),
    },
    total: {
      trackCount: tracks.length,
      position: total - remaining,
      startPosition: 0,
      endPosition: total,
      percentComplete,
      formattedRemaining: remainingTime,
      formattedPosition: useMemo(
        () => formatTime(total - remaining),
        [total, remaining],
      ),
      formattedStartPosition: useMemo(() => formatTime(0), []),
      formattedEndPosition: useMemo(() => formatTime(total), [total]),
    },
  }
}
