import { useMediaQuery } from "@mantine/hooks"

export const useScreenSize = () => {
  // standard breakpoints
  const isMobile = useMediaQuery("(max-width: 768px)")
  const isTablet = useMediaQuery("(min-width: 769px) and (max-width: 1024px)")
  const isDesktop = useMediaQuery("(min-width: 1025px)")

  // for settings UI: mobile/tablet should use drawer, desktop uses buttons
  const shouldUseDrawer = isMobile

  return {
    isMobile,
    isTablet,
    isDesktop,
    shouldUseDrawer,
  }
}
