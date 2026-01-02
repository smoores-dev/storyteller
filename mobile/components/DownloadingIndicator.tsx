import { ArrowDown } from "lucide-react-native"
import { View } from "react-native"
import { AnimatedCircularProgress } from "react-native-circular-progress"

import { useColorTheme } from "@/hooks/useColorTheme"
import { cn } from "@/lib/utils"

import { Icon } from "./ui/icon"

type Props = {
  className?: string | undefined
  progress: number
  size: number
}

export function DownloadingIndicator({ className, progress, size }: Props) {
  const { foreground, background } = useColorTheme()

  return (
    <View
      className={cn("rounded-full bg-background p-[1px]", className)}
      style={{
        width: size + 2,
        height: size + 2,
      }}
    >
      <AnimatedCircularProgress
        size={size}
        width={1}
        fill={progress}
        rotation={0}
        tintColor={foreground}
        backgroundColor={background}
      >
        {() => <Icon as={ArrowDown} size={size * 0.8} color={foreground} />}
      </AnimatedCircularProgress>
    </View>
  )
}
