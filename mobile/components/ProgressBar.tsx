import { StyleSheet, View, ViewProps } from "react-native"
import Slider from "@react-native-community/slider"
import { appColor } from "../design"

type Props = {
  style?: ViewProps["style"]
  start?: number
  stop?: number
  progress: number
  onProgressChange?: (newProgress: number) => void
}

export function ProgressBar({
  style,
  start = 0,
  stop = 100,
  progress,
  onProgressChange,
}: Props) {
  if (onProgressChange) {
    return (
      <Slider
        style={{ height: 3 }}
        minimumValue={start}
        maximumValue={stop}
        value={progress}
        minimumTrackTintColor={appColor}
        maximumTrackTintColor="#EAEAEA"
        thumbTintColor={appColor}
        onValueChange={(value) => {
          if (value === progress) return
          onProgressChange(value)
        }}
      />
    )
  }

  return (
    <View style={[styles.outer, style]}>
      <View
        style={[styles.inner, { width: `${(progress / stop - start) * 100}%` }]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  outer: {
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    height: 3,
    backgroundColor: "#EAEAEA",
  },
  inner: {
    borderBottomLeftRadius: 4,
    height: 3,
    backgroundColor: appColor,
    position: "absolute",
  },
})
