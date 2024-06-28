import { Path, Svg } from "react-native-svg"
import { useColorTheme } from "../hooks/useColorTheme"

export function PrevIcon() {
  const { foreground } = useColorTheme()

  return (
    <Svg width="33" height="32" viewBox="0 0 33 32" fill="none">
      <Path
        d="M9.83331 6.66699V25.3337M24.5 14.0954V17.9052C24.5 20.3413 24.4997 21.5594 23.9883 22.2613C23.5422 22.8735 22.8572 23.2665 22.1037 23.3433C21.2397 23.4314 20.1875 22.8176 18.0832 21.5901L14.8074 19.6792C12.7381 18.4721 11.703 17.8683 11.3541 17.0811C11.0493 16.3931 11.0493 15.6086 11.3541 14.9207C11.7035 14.1321 12.7415 13.5265 14.8177 12.3154L18.0832 10.4105L18.086 10.4089C20.1884 9.1825 21.2401 8.56904 22.1037 8.65707C22.8572 8.73388 23.5422 9.12774 23.9883 9.73991C24.4997 10.4418 24.5 11.6593 24.5 14.0954Z"
        stroke={foreground}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}
