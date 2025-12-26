import { Pause, Play } from "lucide-react-native"
import { ActivityIndicator } from "react-native"
import TrackPlayer from "react-native-track-player"

import { useAudioBook } from "@/hooks/useAudioBook"
import { useColorTheme } from "@/hooks/useColorTheme"
import { playerPlayed } from "@/store/actions"
import { useAppDispatch } from "@/store/appState"

import { Button } from "./ui/button"
import { Icon } from "./ui/icon"

type Props = {
  size?: number | undefined
  automaticRewind?: boolean
}

export function PlayPause({ size = 24, automaticRewind = true }: Props) {
  const { isPlaying, isLoading } = useAudioBook()
  const dispatch = useAppDispatch()
  const { foreground } = useColorTheme()

  if (isLoading) return <ActivityIndicator size={size} />

  return isPlaying ? (
    <Button
      variant="ghost"
      size="icon"
      onPress={() => {
        TrackPlayer.pause()
      }}
    >
      <Icon as={Pause} fill={foreground} size={size} />
    </Button>
  ) : (
    <Button
      variant="ghost"
      size="icon"
      onPress={() => {
        if (automaticRewind) {
          dispatch(playerPlayed())
        } else {
          TrackPlayer.play()
        }
      }}
    >
      <Icon
        as={Play}
        fill={foreground}
        className="bg-transparent"
        size={size}
      />
    </Button>
  )
}
