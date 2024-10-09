import { Path, Svg } from "react-native-svg"
import { useColorTheme } from "../hooks/useColorTheme"

export function CopyIcon() {
  const { foreground } = useColorTheme()

  return (
    <Svg height="24px" viewBox="0 0 48 48" width="24px" fill={foreground}>
      <Path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M32 2h-24c-2.21 0-4 1.79-4 4v28h4v-28h24v-4zm6 8h-22c-2.21 0-4 1.79-4 4v28c0 2.21 1.79 4 4 4h22c2.21 0 4-1.79 4-4v-28c0-2.21-1.79-4-4-4zm0 32h-22v-28h22v28z"
      />
    </Svg>
  )
}
