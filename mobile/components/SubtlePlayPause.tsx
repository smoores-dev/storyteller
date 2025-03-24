import { Pressable } from "react-native-gesture-handler"
import { useAudioBook } from "../hooks/useAudioBook"
import { useAppDispatch } from "../store/appState"
import TrackPlayer from "react-native-track-player"
import { playerPlayed } from "../store/slices/bookshelfSlice"
import { useWindowDimensions } from "react-native"

interface Props {
  automaticRewind: boolean
}

export function SubtlePlayPause({ automaticRewind }: Props) {
  const { isPlaying } = useAudioBook()
  const dimensions = useWindowDimensions()

  const dispatch = useAppDispatch()

  return (
    <Pressable
      style={{
        position: "absolute",
        top: dimensions.height - 100,
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
