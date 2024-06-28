import { StyleProp, View, ViewStyle } from "react-native"
import { G, Path, Svg } from "react-native-svg"
import { useColorTheme } from "../hooks/useColorTheme"

export function DownloadIcon({ style }: { style?: StyleProp<ViewStyle> }) {
  const { foreground } = useColorTheme()

  return (
    <View style={style}>
      <Svg width="25" height="24" viewBox="0 0 25 24" fill="none">
        <G id="Interface / Download">
          <Path
            id="Vector"
            d="M6.5 21H18.5M12.5 3V17M12.5 17L17.5 12M12.5 17L7.5 12"
            stroke={foreground}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </G>
      </Svg>
    </View>
  )
}
