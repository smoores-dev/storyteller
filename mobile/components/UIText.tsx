import { Text, type TextProps } from "react-native"

import { useColorTheme } from "../hooks/useColorTheme"

export function UIText({ children, ...props }: TextProps) {
  const { foreground } = useColorTheme()

  return (
    <Text
      maxFontSizeMultiplier={2}
      {...props}
      style={[{ color: foreground }, props.style]}
    >
      {children}
    </Text>
  )
}
