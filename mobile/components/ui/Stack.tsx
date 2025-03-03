import { View, ViewProps } from "react-native"

export function Stack(props: ViewProps) {
  return <View {...props} style={[props.style, { flexDirection: "column" }]} />
}
