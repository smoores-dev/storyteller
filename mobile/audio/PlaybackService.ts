import TrackPlayer, {
  Event,
  PlaybackState,
  State,
} from "react-native-track-player"
import { store } from "../store/store"
import { Platform } from "react-native"
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

  let beforeDuck: PlaybackState
  TrackPlayer.addEventListener(Event.RemoteDuck, async (event) => {
    if (event.paused) {
      beforeDuck = await TrackPlayer.getPlaybackState()
      if (beforeDuck.state !== State.Playing) return
      if (Platform.OS === "android") {
        await TrackPlayer.pause()
      }
    } else {
      // Android will dispatch a duck event even if the player was
      // already paused; in that case, we don't want to start
      // playing again!
      if (beforeDuck.state !== State.Playing) return
      await TrackPlayer.play()
    }
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
