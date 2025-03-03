import { ActivityIndicator, View } from "react-native"
import { useColorTheme } from "../hooks/useColorTheme"

export function LoadingView() {
  const { background, foreground } = useColorTheme()

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: background,
        justifyContent: "center",
        alignItems: "center",
        zIndex: 1000,
      }}
    >
      <View
        style={[
          {
            position: "absolute",
            top: 0,
            // Trying to line up with the Readium loading indicator
            bottom: 20,
            left: 0,
            right: 0,
            backgroundColor: background,
            justifyContent: "center",
            alignItems: "center",
          },
          {
            backgroundColor: background,
          },
        ]}
      >
        <ActivityIndicator
          color={foreground}
          size={"small"}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  )
}
