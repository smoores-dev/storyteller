import { G, Path, Svg } from "react-native-svg"
import { useColorTheme } from "../hooks/useColorTheme"

export function MoreHorizontalIcon() {
  const { foreground } = useColorTheme()

  return (
    <Svg width="24" height="25" viewBox="0 0 24 25" fill="none">
      <G id="Menu / More_Horizontal">
        <G id="Vector">
          <Path
            d="M17 12.1328C17 12.6851 17.4477 13.1328 18 13.1328C18.5523 13.1328 19 12.6851 19 12.1328C19 11.5805 18.5523 11.1328 18 11.1328C17.4477 11.1328 17 11.5805 17 12.1328Z"
            stroke={foreground}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d="M11 12.1328C11 12.6851 11.4477 13.1328 12 13.1328C12.5523 13.1328 13 12.6851 13 12.1328C13 11.5805 12.5523 11.1328 12 11.1328C11.4477 11.1328 11 11.5805 11 12.1328Z"
            stroke={foreground}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d="M5 12.1328C5 12.6851 5.44772 13.1328 6 13.1328C6.55228 13.1328 7 12.6851 7 12.1328C7 11.5805 6.55228 11.1328 6 11.1328C5.44772 11.1328 5 11.5805 5 12.1328Z"
            stroke={foreground}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </G>
      </G>
    </Svg>
  )
}
