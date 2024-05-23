import { Pressable, StyleSheet, Text, View } from "react-native"
import { ReadiumLocator } from "../modules/readium/src/Readium.types"

type Props = {
  x: number
  y: number
  locator: ReadiumLocator
}

export function SelectionMenu({ x, y }: Props) {
  return (
    <View style={[styles.menu, { top: y, left: x }]}>
      <Pressable>
        <Text>Yellow</Text>
      </Pressable>
      <Pressable>
        <Text>Blue</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  menu: {
    position: "absolute",
    backgroundColor: "white",
    zIndex: 1000,
    flexDirection: "row",
    // transform: "translateX(-50%)",
  },
})
