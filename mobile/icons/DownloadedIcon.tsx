import { StyleProp, ViewStyle } from "react-native"
import Svg, { G, Path } from "react-native-svg"
import { useColorTheme } from "../hooks/useColorTheme"

export function DownloadedIcon({ style }: { style?: StyleProp<ViewStyle> }) {
  const { foreground, background } = useColorTheme()

  return (
    <Svg style={style} width="28" height="28" viewBox="0 0 28 28" fill="none">
      <G id="Arrow / Arrow_Circle_Down">
        <G id="Vector">
          <Path
            d="M14 3.5C19.799 3.5 24.5 8.20101 24.5 14C24.5 19.799 19.799 24.5 14 24.5C8.20101 24.5 3.5 19.799 3.5 14C3.5 8.20101 8.20101 3.5 14 3.5Z"
            fill={foreground}
          />
          <Path
            d="M10.5 15.1667L14 18.6667M14 18.6667L17.5 15.1667M14 18.6667V9.33333M24.5 14C24.5 8.20101 19.799 3.5 14 3.5C8.20101 3.5 3.5 8.20101 3.5 14C3.5 19.799 8.20101 24.5 14 24.5C19.799 24.5 24.5 19.799 24.5 14Z"
            stroke={background}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </G>
      </G>
    </Svg>
  )
}
