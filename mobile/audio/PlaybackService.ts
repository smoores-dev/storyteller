import TrackPlayer, { Event, State } from "react-native-track-player"
import { store } from "../store/store"
import {
  playerPaused,
  playerPlayed,
  playerPositionUpdated,
} from "../store/slices/bookshelfSlice"
import { getGlobalPreferences } from "../store/selectors/preferencesSelectors"

export async function seekBackward(interval: number) {
  const { position: currentPosition } = await TrackPlayer.getProgress()
  const nextPosition = currentPosition - interval
  if (nextPosition < 0) {
    const trackIndex = await TrackPlayer.getActiveTrackIndex()
    const tracks = await TrackPlayer.getQueue()
    if (trackIndex === undefined) return
    const track = tracks[trackIndex - 1]
    if (track?.duration === undefined) return
    const { state } = await TrackPlayer.getPlaybackState()
    await TrackPlayer.skip(trackIndex - 1, track.duration + nextPosition)
    // For some reason, skipping backwards causes the player to pause?
    if (state === State.Playing) await TrackPlayer.play()
  } else {
    await TrackPlayer.seekTo(currentPosition - interval)
  }
  store.dispatch(playerPositionUpdated())
}

export async function seekForward(interval: number) {
  const { position: currentPosition, duration } =
    await TrackPlayer.getProgress()
  const nextPosition = currentPosition + interval
  if (nextPosition > duration) {
    const trackIndex = await TrackPlayer.getActiveTrackIndex()
    if (trackIndex === undefined) return
    await TrackPlayer.skip(trackIndex + 1, nextPosition - duration)
  } else {
    await TrackPlayer.seekTo(currentPosition + interval)
  }
  store.dispatch(playerPositionUpdated())
}

export async function PlaybackService() {
  TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, async () => {
    const { state } = await TrackPlayer.getPlaybackState()
    if (state !== State.Playing) return

    store.dispatch(playerPositionUpdated())
  })

  TrackPlayer.addEventListener(Event.RemotePause, async () => {
    await TrackPlayer.pause()

    store.dispatch(playerPaused())
  })

  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    store.dispatch(playerPlayed())
  })

  TrackPlayer.addEventListener(Event.RemoteJumpBackward, async (event) => {
    await seekBackward(event.interval)
  })

  TrackPlayer.addEventListener(Event.RemoteJumpForward, async (event) => {
    await seekForward(event.interval)
  })

  TrackPlayer.addEventListener(Event.RemoteDuck, async (event) => {
    if (!event.paused) return

    const autoRewindSettings = getGlobalPreferences(
      store.getState(),
    ).automaticRewind

    if (!autoRewindSettings.enabled) return

    // We intentionally use seekBy instead of seekBackward here to
    // avoid seeking past track boundaries. The idea is that it would
    // be _more_ confusing to start a playing session with the last three
    // seconds of the previous chapter, rather than less.
    await TrackPlayer.seekBy(-autoRewindSettings.afterInterruption)
  })
}
