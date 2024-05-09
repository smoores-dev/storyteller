import { useEffect, useState } from "react"
import { Pressable, ScrollView, TouchableOpacity, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import TrackPlayer from "react-native-track-player"
import { UIText } from "./UIText"

const availableSpeeds = [0.75, 1.0, 1.25, 1.5, 1.75, 2, 2.5]

type Props = {
  onOutsideTap?: () => void
}

export function SpeedMenu({ onOutsideTap }: Props) {
  const insets = useSafeAreaInsets()
  const [currentSpeed, setCurrentSpeed] = useState<number | null>(null)

  useEffect(() => {
    async function loadSpeed() {
      const speed = await TrackPlayer.getRate()
      setCurrentSpeed(speed)
    }
    loadSpeed()
  })

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
        {availableSpeeds.map((speed) => (
          <View key={speed} style={{ paddingHorizontal: 8 }}>
            <Pressable
              onPress={() => {
                TrackPlayer.setRate(speed)
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
