import {
  BorderlessButton,
  BorderlessButtonProps,
  RectButton,
  RectButtonProps,
} from "react-native-gesture-handler"
import { colors } from "./tokens/colors"
import { ThemeOverrideProvider } from "../ThemeOverrideProvider"
import { useColorTheme } from "../../hooks/useColorTheme"
import { spacing } from "./tokens/spacing"
import { StyleSheet, View } from "react-native"

export type ButtonProps = {
  variant?: "primary" | "secondary"
  disabled?: boolean
} & (RectButtonProps | ({ chromeless?: boolean } & BorderlessButtonProps))

export function Button({
  variant = "secondary",
  disabled,
  children,
  onPress,
  ...props
}: ButtonProps) {
  const { surface } = useColorTheme()

  if ("chromeless" in props) {
    return (
      <BorderlessButton
        {...props}
        style={[disabled && styles.disabled, props.style]}
        {...(disabled ? {} : { onPress })}
      >
        {children}
      </BorderlessButton>
    )
  }

  const button = (
    <View style={{ borderTopRightRadius: 8, overflow: "hidden" }}>
      <RectButton
        underlayColor={variant === "primary" ? colors.primary9 : surface}
        {...props}
        {...(disabled ? {} : { onPress })}
        style={[
          disabled && styles.disabled,
          styles.rectButton,
          {
            backgroundColor: variant === "primary" ? colors.primary9 : surface,
          },
          props.style,
        ]}
      >
        {children}
      </RectButton>
    </View>
  )

  if (variant === "secondary") return button

  return (
    <ThemeOverrideProvider foreground={colors.white}>
      {button}
    </ThemeOverrideProvider>
  )
}

const styles = StyleSheet.create({
  rectButton: {
    paddingVertical: spacing[1],
    paddingHorizontal: spacing["1.5"],
    borderRadius: spacing.borderRadius,
    alignItems: "center",
  },
  disabled: { opacity: 0.6 },
})
