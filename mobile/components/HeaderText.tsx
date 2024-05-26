import { Text, TextProps } from "react-native"
import { useColorTheme } from "../hooks/useColorTheme"

export function HeaderText({ children, ...props }: TextProps) {
  const { foreground } = useColorTheme()

  return (
    <Text
      {...props}
      style={[{ fontFamily: "YoungSerif" }, props.style, { color: foreground }]}
    >
      {children}
    </Text>
  )
}
