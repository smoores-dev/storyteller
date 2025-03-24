import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import TrackPlayer, {
  Event,
  usePlaybackState,
  State,
  useProgress,
  useTrackPlayerEvents,
} from "react-native-track-player"
import { useAppSelector } from "../store/appState"
import {
  getCurrentlyPlayingBook,
  getIsAudioLoading,
} from "../store/selectors/bookshelfSelectors"
import { BookshelfTrack } from "../store/slices/bookshelfSlice"
import { getBookPlayerSpeed } from "../store/selectors/preferencesSelectors"

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

export function formatTimeHuman(time: number) {
  const hours = Math.floor(time / 3600)
  const minutes = Math.floor(time / 60 - hours * 60)

  if (hours) {
    return `${hours} hr ${minutes} min`
  }
  return `${minutes} min`
}

export function useAudioBook() {
  return useContext(AudioBookContext)
}

export type AudioBookContextValue = {
  isLoading: boolean
  progress: number
  isPlaying: boolean
  trackCount: number
  tracks: BookshelfTrack[]
  startPosition: number
  endPosition: number
  percentComplete: number
  rate: number
  remainingTime: string
  track: {
    index: number
    position: number
    startPosition: number
    endPosition: number
    percentComplete: number
    formattedPosition: string
    formattedStartPosition: string
    formattedEndPosition: string
  }
  total: {
    position: number
    startPosition: number
    endPosition: number
    percentComplete: number
    formattedPosition: string
    formattedStartPosition: string
    formattedEndPosition: string
    trackCount: number
  }
}

const AudioBookContext = createContext(null as unknown as AudioBookContextValue)

interface Props {
  children: ReactNode
}

export function AudioBookProvider({ children }: Props) {
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

  const book = useAppSelector(getCurrentlyPlayingBook)
  const rate = useAppSelector(
    (state) => (book && getBookPlayerSpeed(state, book.id)) ?? 1,
  )

  // If the player has transitioned from playing
  // into buffering (or ready, which it sometimos does
  // on Android), it will automatically transition back
  // to playing, probably without any actual gap in
  // audio. In that case, we want to continue showing the
  // audio as playing, since that's what the user experienced.
  // If the audio was _not_ already playing when it
  // transitioned to buffering/ready, then we show the audio
  // as paused.
  const lastPlayPauseState = useRef(State.Paused)

  const isPlaying =
    lastPlayPauseState.current === State.Paused
      ? playerState === State.Playing
      : playerState === State.Playing ||
        playerState === State.Buffering ||
        playerState === State.Ready

  if (playerState === State.Playing || playerState === State.Paused) {
    lastPlayPauseState.current = playerState
  }

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

  const rateAdjustedRemaining = remaining / rate
  const percentComplete = Math.round(((total - remaining) / total) * 100)
  const remainingHours = Math.floor(rateAdjustedRemaining / 3600)
  const remainingMinutes = Math.floor(
    rateAdjustedRemaining / 60 - remainingHours * 60,
  )
  const remainingTime = `${remainingHours} hours ${remainingMinutes} minutes`

  const value = useMemo(
    () => ({
      isLoading,
      progress: position,
      isPlaying,
      trackCount: tracks.length,
      tracks,
      startPosition: 0,
      endPosition: duration,
      percentComplete: percentComplete,
      rate: rate,
      remainingTime: remainingTime,
      track: {
        index: currentTrackIndex,
        position,
        startPosition: 0,
        endPosition: duration,
        percentComplete: Math.round((position / duration) * 100),
        formattedPosition: formatTime(position / rate),
        formattedStartPosition: formatTime(0),
        formattedEndPosition: formatTime(duration / rate),
      },
      total: {
        trackCount: tracks.length,
        position: total - remaining,
        startPosition: 0,
        endPosition: total,
        percentComplete,
        formattedRemaining: remainingTime,
        formattedPosition: formatTime((total - remaining) / rate),
        formattedStartPosition: formatTime(0),
        formattedEndPosition: formatTime(total / rate),
      },
    }),
    [
      currentTrackIndex,
      duration,
      isLoading,
      isPlaying,
      percentComplete,
      position,
      rate,
      remaining,
      remainingTime,
      total,
      tracks,
    ],
  )

  return (
    <AudioBookContext.Provider value={value}>
      {children}
    </AudioBookContext.Provider>
  )
}
