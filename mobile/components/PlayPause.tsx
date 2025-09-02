import { ActivityIndicator, Pressable, type ViewProps } from "react-native"
import TrackPlayer from "react-native-track-player"

import { useAudioBook } from "../hooks/useAudioBook"
import { useColorTheme } from "../hooks/useColorTheme"
import { PauseIcon } from "../icons/PauseIcon"
import { PlayIcon } from "../icons/PlayIcon"
import { useAppDispatch } from "../store/appState"
import { playerPlayed } from "../store/slices/bookshelfSlice"

type Props = {
  style?: ViewProps["style"]
  automaticRewind?: boolean
}

export function PlayPause({ style, automaticRewind = true }: Props) {
  const { isPlaying, isLoading } = useAudioBook()
  const dispatch = useAppDispatch()
  const { foreground } = useColorTheme()

  if (isLoading) return <ActivityIndicator style={style} />

  return isPlaying ? (
    <Pressable
      hitSlop={20}
      onPress={() => {
        TrackPlayer.pause()
      }}
    >
      <PauseIcon style={style} />
    </Pressable>
  ) : (
    <Pressable
      hitSlop={20}
      onPress={() => {
        if (automaticRewind) {
          dispatch(playerPlayed())
        } else {
          TrackPlayer.play()
        }
      }}
    >
      <PlayIcon
        fill={foreground}
        style={[
          {
            backgroundColor: "transparent",
          },
          style,
        ]}
      />
    </Pressable>
  )
}
