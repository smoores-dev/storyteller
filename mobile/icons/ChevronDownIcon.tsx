import { Path, Svg } from "react-native-svg"
import { useColorTheme } from "../hooks/useColorTheme"

export function ChevronDownIcon() {
  const { foreground } = useColorTheme()

  return (
    <Svg width="44" height="44" viewBox="0 0 44 44" fill="none">
      <Path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M31 17.9347L21.9347 27L13 18.0653L14.0702 16.995L21.9347 24.8595L29.9297 16.8645L31 17.9347Z"
        fill={foreground}
      />
    </Svg>
  )
}
