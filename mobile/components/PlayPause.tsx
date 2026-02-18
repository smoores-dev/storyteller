import { Pause, Play } from "lucide-react-native"
import { ActivityIndicator } from "react-native"

import { useColorTheme } from "@/hooks/useColorTheme"
import { Storyteller } from "@/modules/readium"
import { useAppSelector } from "@/store/appState"
import {
  getIsAudioLoading,
  getIsPlaying,
} from "@/store/selectors/bookshelfSelectors"

import { Button } from "./ui/button"
import { Icon } from "./ui/icon"

type Props = {
  size?: number | undefined
  automaticRewind?: boolean
}

export function PlayPause({ size = 24, automaticRewind = true }: Props) {
  const isPlaying = useAppSelector(getIsPlaying)
  const isLoading = useAppSelector(getIsAudioLoading)
  const { foreground } = useColorTheme()

  if (isLoading) return <ActivityIndicator size={size} />

  return isPlaying ? (
    <Button
      variant="ghost"
      size="icon"
      onPress={() => {
        Storyteller.pause()
      }}
    >
      <Icon as={Pause} fill={foreground} size={size} />
    </Button>
  ) : (
    <Button
      variant="ghost"
      size="icon"
      onPress={() => {
        Storyteller.play(automaticRewind)
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
