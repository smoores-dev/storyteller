import { Path, Svg } from "react-native-svg"
import { useColorTheme } from "../hooks/useColorTheme"

export function ChevronLeftIcon() {
  const { foreground } = useColorTheme()

  return (
    <Svg width="44" height="44" viewBox="0 0 44 44" fill="none">
      <Path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M26.0653 31L17 21.9347L25.9347 13L27.005 14.0703L19.1405 21.9347L27.1355 29.9298L26.0653 31Z"
        fill={foreground}
      />
    </Svg>
  )
}
