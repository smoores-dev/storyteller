import { Pressable, ScrollView, TouchableOpacity, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { UIText } from "./UIText"
import { bookshelfSlice, playerSpeeds } from "../store/slices/bookshelfSlice"
import { useAppDispatch, useAppSelector } from "../store/appState"
import { getPlayerSpeed } from "../store/selectors/bookshelfSelectors"

type Props = {
  bookId: number
  onOutsideTap?: () => void
}

export function SpeedMenu({ bookId, onOutsideTap }: Props) {
  const insets = useSafeAreaInsets()

  const dispatch = useAppDispatch()
  const currentSpeed = useAppSelector((state) => getPlayerSpeed(state, bookId))

  return (
    <>
      <TouchableOpacity
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 2,
        }}
        onPress={onOutsideTap}
      />
      <ScrollView
        style={{
          position: "absolute",
          right: 32,
          left: 106,
          top: insets.top + 56,
          // paddingHorizontal: 32,
          paddingVertical: 16,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: "black",
          bottom: 300,
          zIndex: 3,
          backgroundColor: "white",
        }}
      >
        {playerSpeeds.map((speed) => (
          <View key={speed} style={{ paddingHorizontal: 8 }}>
            <Pressable
              onPress={() => {
                dispatch(
                  bookshelfSlice.actions.playerSpeedChanged({ bookId, speed }),
                )
                onOutsideTap?.()
              }}
              style={{
                borderBottomWidth: 1,
                borderBottomColor: "#CCC",
                paddingVertical: 16,
                paddingHorizontal: 16,
              }}
            >
              <UIText
                style={{
                  fontSize: 14,
                  fontWeight: speed === currentSpeed ? "bold" : "normal",
                }}
              >
                {speed}x
              </UIText>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </>
  )
}
