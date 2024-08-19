import { useColorTheme } from "../hooks/useColorTheme"
import { Link } from "expo-router"
import type { LinkProps } from "expo-router/build/link/Link"

export function UILink<T extends string | object>({
  children,
  ...props
}: LinkProps<T>) {
  const { foreground } = useColorTheme()
  return (
    <Link {...props} style={[props.style, { color: foreground }]}>
      {children}
    </Link>
  )
}
