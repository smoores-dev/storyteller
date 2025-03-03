import { ReactNode, createContext, useMemo } from "react"

type ThemeOverrideContextValue = {
  foreground?: string | undefined
  background?: string | undefined
  surface?: string | undefined
  dark?: boolean | undefined
}

export const ThemeOverrideContext =
  createContext<ThemeOverrideContextValue | null>(null)

export function ThemeOverrideProvider({
  children,
  foreground,
  background,
  surface,
  dark,
}: ThemeOverrideContextValue & { children: ReactNode }) {
  const value = useMemo(
    () => ({ foreground, background, surface, dark }),
    [background, dark, foreground, surface],
  )
  return (
    <ThemeOverrideContext.Provider value={value}>
      {children}
    </ThemeOverrideContext.Provider>
  )
}
