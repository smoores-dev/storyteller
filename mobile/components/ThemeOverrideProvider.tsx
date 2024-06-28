import { ReactNode, createContext, useMemo } from "react"

type ThemeOverrideContextValue = {
  foreground?: string | undefined
  background?: string | undefined
  dark?: boolean | undefined
}

export const ThemeOverrideContext =
  createContext<ThemeOverrideContextValue | null>(null)

export function ThemeOverrideProvider({
  children,
  foreground,
  background,
  dark,
}: ThemeOverrideContextValue & { children: ReactNode }) {
  const value = useMemo(
    () => ({ foreground, background, dark }),
    [background, dark, foreground],
  )
  return (
    <ThemeOverrideContext.Provider value={value}>
      {children}
    </ThemeOverrideContext.Provider>
  )
}
