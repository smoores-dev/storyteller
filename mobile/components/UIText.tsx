import { Text, TextProps } from "react-native"
import { useColorTheme } from "../hooks/useColorTheme"

export function UIText({ children, ...props }: TextProps) {
  const { foreground } = useColorTheme()

  return (
    <Text {...props} style={[props.style, { color: foreground }]}>
      {children}
    </Text>
  )
}
