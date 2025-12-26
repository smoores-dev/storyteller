import { View } from "react-native"
import { AnimatedCircularProgress } from "react-native-circular-progress"

import { useColorTheme } from "@/hooks/useColorTheme"
import { ArrowDownIcon } from "@/icons/ArrowDownIcon"

type Props = {
  className?: string | undefined
  progress: number
}

export function DownloadingIndicator({ className, progress }: Props) {
  const { foreground } = useColorTheme()

  return (
    <View {...(className && { className })}>
      <AnimatedCircularProgress
        size={24}
        width={2}
        fill={progress}
        rotation={0}
        tintColor={foreground}
      >
        {() => <ArrowDownIcon />}
      </AnimatedCircularProgress>
    </View>
  )
}
