import { StyleProp, StyleSheet, View, ViewStyle } from "react-native"
import Slider from "@react-native-community/slider"
import { appColor } from "../design"
import { colors } from "./ui/tokens/colors"
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
          style={{ height: 3 }}
          minimumValue={start}
          maximumValue={stop}
          step={step}
          value={progress}
          thumbImage={require("../assets/slider-thumb-image.png")}
          minimumTrackTintColor={colors.primary9}
          maximumTrackTintColor={surface}
          onValueChange={(value) => {
            if (value === progress) return
            onProgressChange(value)
          }}
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
