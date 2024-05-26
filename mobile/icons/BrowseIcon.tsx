import { ClipPath, Defs, G, Path, Rect, Svg } from "react-native-svg"
import { useColorTheme } from "../hooks/useColorTheme"

type Props = {
  focused: boolean
}

export function BrowseIcon({ focused }: Props) {
  const { foreground, background } = useColorTheme()

  return focused ? (
    <Svg width="26" height="26" viewBox="0 0 26 26" fill="none">
      <G clipPath="url(#clip0_365_2899)">
        <Rect width="26" height="26" rx="13" fill={foreground} />
        <Path
          d="M5 13H13M13 13H21M13 13V21M13 13V5"
          stroke={background}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </G>
      <Defs>
        <ClipPath id="clip0_365_2899">
          <Rect width="26" height="26" rx="13" fill={background} />
        </ClipPath>
      </Defs>
    </Svg>
  ) : (
    <Svg width="33" height="32" viewBox="0 0 33 32" fill="none">
      <Path
        d="M8.5 16H16.5M16.5 16H24.5M16.5 16V24M16.5 16V8"
        stroke={foreground}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}
