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
    <View className={cn("rounded-b-sm bg-secondary", className)}>
      <View
        className="absolute h-[3px] rounded-bl-sm bg-primary"
        style={{
          width: `${(progress / (stop - start)) * 100}%`,
        }}
      />
    </View>
  )
}
