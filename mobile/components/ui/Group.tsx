import { View, ViewProps } from "react-native"

export function Group(props: ViewProps) {
  return <View {...props} style={[props.style, { flexDirection: "row" }]} />
}
