import { Link } from "expo-router"
import { type LinkProps } from "expo-router/build/link/Link"

import { useColorTheme } from "../hooks/useColorTheme"

export function UILink({ children, ...props }: LinkProps) {
  const { foreground } = useColorTheme()
  return (
    <Link {...props} style={[props.style, { color: foreground }]}>
      {children}
    </Link>
  )
}
