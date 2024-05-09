import Svg, { Path } from "react-native-svg"

type Props = {
  focused: boolean
}

export function BookshelfIcon({ focused }: Props) {
  return (
    <Svg width="33" height="32" viewBox="0 0 33 32" fill="none">
      <Path
        d="M17.3198 6L6.87978 6C5.87168 6 5.3679 6 4.98285 6.22889C4.64416 6.43022 4.36852 6.75125 4.19595 7.14639C3.99995 7.59516 3.99995 8.18294 3.99995 9.35675L3.99995 23.6432C3.99995 24.8171 3.99995 25.404 4.19594 25.8528C4.36852 26.2479 4.64416 26.57 4.98285 26.7713C5.36752 27 5.87061 27 6.87673 27L17.3227 27C18.3289 27 18.8327 27 19.2173 26.7713C19.556 26.57 19.8312 26.2479 20.0038 25.8528C20.2 25.4035 20.2 24.8163 20.2 23.6402L20.2 9.3602C20.2 8.18409 20.2 7.5956 20.0038 7.14639C19.8312 6.75125 19.556 6.43022 19.2173 6.22889C18.8323 6 18.3279 6 17.3198 6Z"
        fill={focused ? "#141414" : "none"}
        stroke="#141414"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M24.0251 8.91348L24.0251 24.6868"
        stroke="#141414"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M27.7 11.0135L27.7 22.5868"
        stroke="#141414"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}
