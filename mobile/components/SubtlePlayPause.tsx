import { Pressable } from "react-native-gesture-handler"
import TrackPlayer from "react-native-track-player"

import { useAudioBook } from "../hooks/useAudioBook"
import { useAppDispatch } from "../store/appState"
import { playerPlayed } from "../store/slices/bookshelfSlice"

interface Props {
  automaticRewind: boolean
}

export function SubtlePlayPause({ automaticRewind }: Props) {
  const { isPlaying } = useAudioBook()

  const dispatch = useAppDispatch()

  return (
    <Pressable
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 3,
      }}
      onPress={() => {
        if (isPlaying) {
          TrackPlayer.pause()
          return
        }
        if (automaticRewind) {
          dispatch(playerPlayed())
        } else {
          TrackPlayer.play()
        }
      }}
    />
  )
}
