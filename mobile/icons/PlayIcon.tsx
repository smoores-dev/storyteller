import { StyleProp, View, ViewStyle } from "react-native"
import { G, Path, Svg } from "react-native-svg"
import { useColorTheme } from "../hooks/useColorTheme"

export function PlayIcon({
  fill,
  style,
}: {
  fill?: string
  style?: StyleProp<ViewStyle>
}) {
  const { foreground, background } = useColorTheme()

  const fillColor = fill ?? background

  return (
    <View
      style={[
        {
          justifyContent: "center",
          alignItems: "center",
          paddingVertical: 4.571,
          paddingRight: 2.857,
          paddingLeft: 6.286,
          borderRadius: 57.143,
          backgroundColor: foreground,
          width: 32,
          height: 32,
        },
        style,
      ]}
    >
      <Svg style={style} viewBox="0 0 24 24" fill="none">
        <G id="Media / Play">
          <Path
            id="Vector"
            d="M5.04762 17.2125V7.05382C5.04762 6.21614 5.04762 5.79683 5.2239 5.54898C5.37775 5.33266 5.6149 5.19064 5.87817 5.15668C6.1797 5.11779 6.54953 5.31503 7.28814 5.70895L16.8119 10.7883L16.8154 10.7899C17.6316 11.2252 18.04 11.4429 18.1739 11.7332C18.2907 11.9864 18.2907 12.2787 18.1739 12.5319C18.0398 12.8225 17.6305 13.0412 16.8119 13.4777L7.28814 18.5571C6.549 18.9513 6.17981 19.1478 5.87817 19.1089C5.6149 19.0749 5.37775 18.9329 5.2239 18.7166C5.04762 18.4688 5.04762 18.0502 5.04762 17.2125Z"
            fill={fillColor}
          />
        </G>
      </Svg>
    </View>
  )
}
