import { ArrowDown } from "lucide-react-native"
import { useDeferredValue } from "react"
import { View, type ViewStyle } from "react-native"
import { AnimatedCircularProgress } from "react-native-circular-progress"

import { useColorTheme } from "@/hooks/useColorTheme"
import { cn } from "@/lib/utils"

import { Icon } from "./ui/icon"

type Props = {
  className?: string | undefined
  progress: number
  size: number
  style: ViewStyle
}

export function DownloadingIndicator({
  className,
  progress,
  size,
  style,
}: Props) {
  const { foreground, background } = useColorTheme()
  const deferredProgress = useDeferredValue(progress)

  return (
    <View
      className={cn("bg-background rounded-full p-[1px]", className)}
      style={[
        {
          width: size + 2,
          height: size + 2,
        },
        style,
      ]}
    >
      <AnimatedCircularProgress
        size={size}
        width={1}
        fill={deferredProgress}
        rotation={0}
        tintColor={foreground}
        backgroundColor={background}
      >
        {() => <Icon as={ArrowDown} size={size * 0.8} color={foreground} />}
      </AnimatedCircularProgress>
    </View>
  )
}
