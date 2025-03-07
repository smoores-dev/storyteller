import { StyleProp, StyleSheet, View, ViewStyle } from "react-native"
import { Slider } from "./ui/Slider"
import { appColor } from "../design"
import { useColorTheme } from "../hooks/useColorTheme"

type Props = {
  style?: StyleProp<ViewStyle>
  start?: number
  step?: number
  stop?: number
  progress: number
  onProgressChange?: ((newProgress: number) => void) | undefined
}

export function ProgressBar({
  style,
  start = 0,
  step = 1,
  stop = 100,
  progress,
  onProgressChange,
}: Props) {
  const { surface } = useColorTheme()
  if (onProgressChange) {
    return (
      <View style={style}>
        <Slider
          start={start}
          stop={stop}
          step={step}
          value={progress}
          onValueChange={onProgressChange}
        />
      </View>
    )
  }

  return (
    <View style={[styles.outer, { backgroundColor: surface }, style]}>
      <View
        style={[
          styles.inner,
          { width: `${(progress / (stop - start)) * 100}%` },
        ]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  outer: {
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    height: 3,
  },
  inner: {
    borderBottomLeftRadius: 4,
    height: 3,
    backgroundColor: appColor,
    position: "absolute",
  },
})
