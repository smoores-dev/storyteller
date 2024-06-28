import { useColorTheme } from "../hooks/useColorTheme"
import { Link } from "expo-router"
import type { LinkProps } from "expo-router/build/link/Link"

export function UILink({ children, ...props }: LinkProps) {
  const { foreground } = useColorTheme()
  return (
    <Link {...props} style={[props.style, { color: foreground }]}>
      {children}
    </Link>
  )
}
