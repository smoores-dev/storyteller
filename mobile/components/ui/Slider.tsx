import BaseSlider from "@react-native-community/slider"
import { Platform, type StyleProp, type ViewStyle } from "react-native"

import { useColorTheme } from "../../hooks/useColorTheme"

import { colors } from "./tokens/colors"

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
            /* eslint-disable-next-line @typescript-eslint/no-require-imports */
            thumbImage: require("../../assets/slider-thumb-image.png"),
          }
        : { thumbTintColor: colors.primary9 })}
    />
  )
}
