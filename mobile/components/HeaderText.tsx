import { Text, TextProps } from "react-native"

export function HeaderText({ children, ...props }: TextProps) {
  return (
    <Text {...props} style={[{ fontFamily: "YoungSerif" }, props.style]}>
      {children}
    </Text>
  )
}
