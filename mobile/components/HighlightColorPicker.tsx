import { Pressable, StyleSheet, View, ViewStyle } from "react-native"
import { HighlightTint, highlightTints } from "../colors"
import { useColorTheme } from "../hooks/useColorTheme"

type Props = {
  style?: ViewStyle | undefined
  value?: HighlightTint | undefined
  onChange: (value: HighlightTint) => void
}

export function HighlightColorPicker({ style, value, onChange }: Props) {
  const { foreground, dark } = useColorTheme()
  return (
    <View style={[styles.container, style]}>
      {(
        Object.keys(
          highlightTints[dark ? "dark" : "light"],
        ) as Array<HighlightTint>
      ).map((color) => (
        <Pressable key={color} onPress={() => onChange(color)}>
          <View
            style={[
              styles.button,
              {
                backgroundColor: highlightTints[dark ? "dark" : "light"][color],
              },
              value === color && {
                borderWidth: 2,
                borderColor: foreground,
              },
            ]}
          ></View>
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
  },
  button: {
    width: 24,
    height: 24,
    borderRadius: 12,
    margin: 8,
    borderWidth: 1,
    borderColor: "#AAA",
  },
})
