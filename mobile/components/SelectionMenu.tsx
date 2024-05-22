import {
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native"
import { ReadiumLocator } from "../modules/readium/src/Readium.types"

type Props = {
  x: number
  y: number
  locator: ReadiumLocator
  onOutsideTap: () => void
}

export function SelectionMenu({ x, y, onOutsideTap }: Props) {
  console.log(x, y)
  return (
    <>
      <TouchableOpacity style={styles.backdrop} onPress={onOutsideTap} />
      <View style={[styles.menu, { top: y, left: x }]}>
        <Pressable>
          <Text>Yellow</Text>
        </Pressable>
        <Pressable>
          <Text>Blue</Text>
        </Pressable>
        <Pressable>
          <Text>Add note</Text>
        </Pressable>
      </View>
    </>
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
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
  },
})
