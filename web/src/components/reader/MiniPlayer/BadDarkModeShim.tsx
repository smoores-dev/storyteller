import { useComputedColorScheme } from "@mantine/core"

export const BadDarkModeShim = () => {
  const computedTheme = useComputedColorScheme()
  const isDarkMode = computedTheme === "dark"

  if (!isDarkMode) {
    return null
  }

  return (
    <style>
      {`
:root {
    --reader-ui-bg: 0 0% 10.2%;
    --reader-ui-surface: 0 0% 10.2%;
    --reader-ui-surface-hover: 0 0% 14.9%;
    --reader-ui-border: 0 0% 20%;
    --reader-ui-text: 0 0% 91%;
    --reader-ui-text-secondary: 0 0% 63.9%;
    --reader-ui-text-muted: 0 0% 45.1%;
    --reader-ui-accent: 24.6 95% 53.1%;
    --reader-ui-accent-hover: 20.5 90.2% 48.2%;
}
`}
    </style>
  )
}
