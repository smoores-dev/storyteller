import { Pressable, StyleSheet } from "react-native"
import { UIText } from "./UIText"
import { ReactNode } from "react"
import { activeBackgroundColor } from "../design"

type Props = {
  children: ReactNode
  onPress: () => void
}

export function Button({ children, onPress }: Props) {
  return (
    <Pressable style={buttonStyles.button} onPress={onPress}>
      <UIText>{children}</UIText>
    </Pressable>
  )
}

export const buttonStyles = StyleSheet.create({
  button: {
    backgroundColor: activeBackgroundColor,
    borderWidth: 1,
    borderRadius: 2,
    borderColor: "#7A7B86",
    paddingVertical: 12,
    paddingHorizontal: 16,
    display: "flex",
    alignItems: "center",
    marginTop: 16,
    marginBottom: 32,
  },
})
