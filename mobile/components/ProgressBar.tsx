import { View } from "react-native"

import { cn } from "@/lib/utils"

import { Slider } from "./ui/slider"

type Props = {
  className?: string | undefined
  start?: number
  step?: number
  stop?: number
  progress: number
  onProgressChange?: ((newProgress: number) => void) | undefined
  onPanStart?: (() => void) | undefined
  onPanStop?: (() => void) | undefined
}

export function ProgressBar({
  className,
  start = 0,
  step = 1,
  stop = 100,
  progress,
  onProgressChange,
  onPanStart,
  onPanStop,
}: Props) {
  if (onProgressChange) {
    return (
      <View {...(className && { className })}>
        <Slider
          start={start}
          stop={stop}
          step={step}
          value={progress}
          onValueChange={onProgressChange}
          onPanStart={onPanStart}
          onPanStop={onPanStop}
        />
      </View>
    )
  }

  return (
    <View className={cn("bg-secondary rounded-b-sm", className)}>
      <View
        className="bg-primary absolute h-0.75 rounded-bl-sm"
        style={{
          width: `${stop === start ? 0 : (progress / (stop - start)) * 100}%`,
        }}
      />
    </View>
  )
}
