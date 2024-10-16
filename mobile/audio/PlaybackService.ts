import TrackPlayer, { Event, State } from "react-native-track-player"
import { store } from "../store/store"
import {
  playerPaused,
  playerPositionUpdated,
} from "../store/slices/bookshelfSlice"

export async function PlaybackService() {
  TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, async () => {
    const state = await TrackPlayer.getState()
    if (state !== State.Playing) return

    store.dispatch(playerPositionUpdated())
  })

  TrackPlayer.addEventListener(Event.RemotePause, async () => {
    await TrackPlayer.pause()

    store.dispatch(playerPaused())
  })

  TrackPlayer.addEventListener(Event.RemotePlay, async () => {
    await TrackPlayer.play()
  })

  TrackPlayer.addEventListener(Event.RemoteJumpBackward, async (event) => {
    const { position: currentPosition } = await TrackPlayer.getProgress()
    await TrackPlayer.seekTo(currentPosition - event.interval)
    store.dispatch(playerPositionUpdated())
  })

  TrackPlayer.addEventListener(Event.RemoteJumpForward, async (event) => {
    const { position: currentPosition } = await TrackPlayer.getProgress()
    await TrackPlayer.seekTo(currentPosition + event.interval)
    store.dispatch(playerPositionUpdated())
  })
}
