import { ActivityIndicator, Pressable, ViewProps } from "react-native"
import { PauseIcon } from "../icons/PauseIcon"
import { PlayIcon } from "../icons/PlayIcon"
import TrackPlayer from "react-native-track-player"

type Props = {
  style?: ViewProps["style"]
  isPlaying: boolean
  isLoading?: boolean
}

export function PlayPause({ style, isPlaying, isLoading = false }: Props) {
  if (isLoading) return <ActivityIndicator />

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
        TrackPlayer.play()
      }}
    >
      <PlayIcon
        fill="black"
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
