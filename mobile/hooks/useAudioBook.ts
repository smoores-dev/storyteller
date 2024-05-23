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
    startPosition: 0,
    endPosition: duration,
    percentComplete: percentComplete,
    remainingTime: remainingTime,
  }
}
