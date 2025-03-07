import BaseSlider from "@react-native-community/slider"
import { colors } from "./tokens/colors"
import { useColorTheme } from "../../hooks/useColorTheme"
import { Platform, StyleProp, ViewStyle } from "react-native"

interface Props {
  style?: StyleProp<ViewStyle>
  start: number
  stop: number
  step: number
  value: number
  onValueChange: (newValue: number) => void
}

export function Slider({
  style,
  start,
  stop,
  step,
  value,
  onValueChange,
}: Props) {
  const { surface } = useColorTheme()
  return (
    <BaseSlider
      style={[{ height: 3 }, style]}
      minimumValue={start}
      maximumValue={stop}
      step={step}
      value={value}
      minimumTrackTintColor={colors.primary9}
      maximumTrackTintColor={surface}
      onValueChange={(newValue) => {
        if (newValue === value) return
        onValueChange(newValue)
      }}
      {...(Platform.OS === "ios"
        ? {
            thumbImage: require("../../assets/slider-thumb-image.png"),
          }
        : { thumbTintColor: colors.primary9 })}
    />
  )
}
