import { Text, TextProps } from "react-native"

export function UIText({ children, ...props }: TextProps) {
  return (
    <Text {...props} style={[props.style]}>
      {children}
    </Text>
  )
}
