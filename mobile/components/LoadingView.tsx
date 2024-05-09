import { ActivityIndicator, View } from "react-native"

export function LoadingView() {
  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: "#FFF",
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
            backgroundColor: "#FFF",
            justifyContent: "center",
            alignItems: "center",
          },
          {
            backgroundColor: "#FFF",
          },
        ]}
      >
        <ActivityIndicator color={"black"} size={"small"} style={{ flex: 1 }} />
      </View>
    </View>
  )
}
