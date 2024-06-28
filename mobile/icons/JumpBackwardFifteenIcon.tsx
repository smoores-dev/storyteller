import Svg, { Path } from "react-native-svg"
import { useColorTheme } from "../hooks/useColorTheme"

export function JumpBackwardFifteenIcon() {
  const { foreground } = useColorTheme()

  return (
    <Svg width="25" height="26" viewBox="0 0 25 26" fill="none">
      <Path
        d="M10.5001 8.45598H3.83335V1.66699M16.0894 24.3337C18.2833 23.6972 20.2188 22.3617 21.6122 20.5223C23.0057 18.683 23.7832 16.4371 23.831 14.1146C23.8788 11.792 23.1946 9.51508 21.878 7.61797C20.5614 5.72085 18.6822 4.30383 16.5163 3.57441C14.3504 2.84498 12.0117 2.84148 9.84401 3.56513C7.67627 4.28878 5.7934 5.70094 4.47192 7.59454M1.16669 15.0003L2.50002 13.667V24.3337M11.8334 13.667H7.83335L6.66669 18.3337H9.42684C11.3461 18.3337 12.7717 20.1109 12.3554 21.9845C12.0504 23.3571 10.8329 24.3337 9.42684 24.3337H6.50002"
        stroke={foreground}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}
