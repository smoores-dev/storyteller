import { TextInput as BaseTextInput } from "react-native-gesture-handler"
import { ComponentProps } from "react"
import { StyleSheet } from "react-native"
import { useColorTheme } from "../../hooks/useColorTheme"
import { spacing } from "./tokens/spacing"

export function TextInput(props: ComponentProps<BaseTextInput>) {
  const { surface, foreground } = useColorTheme()

  return (
    <BaseTextInput
      {...props}
      style={[
        styles.input,
        { borderColor: surface, color: foreground },
        props.style,
      ]}
    />
  )
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: spacing.borderRadius,
    padding: spacing[1],
  },
})
