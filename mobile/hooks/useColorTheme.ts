import { useCSSVariable, useUniwind } from "uniwind"

export function useColorTheme() {
  const foreground = useCSSVariable("--color-foreground") as string
  const background = useCSSVariable("--color-background") as string
  const { theme } = useUniwind()

  return {
    foreground,
    background,
    dark: theme === "dark",
  }
}
