import convert from "color-convert"
import { vars } from "nativewind"
import { type ReactNode, createContext } from "react"
import { View } from "react-native"

type ThemeOverrideContextValue = {
  foreground?: string | undefined
  background?: string | undefined
  surface?: string | undefined
  foregroundSecondary?: string | undefined
  dark?: boolean | undefined
}

export const ThemeOverrideContext =
  createContext<ThemeOverrideContextValue | null>(null)

export function ThemeOverrideProvider({
  children,
  foreground,
  background,
}: {
  foreground: string
  background: string
  children: ReactNode
}) {
  const bg = convert.hex.hsl(background)
  const fg = convert.hex.hsl(foreground)
  const bgHsl = `${bg[0]} ${bg[1]}% ${bg[2]}%`
  const fgHsl = `${fg[0]} ${fg[1]}% ${fg[2]}%`
  return (
    <View
      className="flex-1"
      style={vars({
        "--background": bgHsl,
        "--foreground": fgHsl,
        "--card": bgHsl,
        "--card-foreground": fgHsl,
        "--secondary-foreground": fgHsl,
        "--secondary": `${fgHsl} / 0.1`,
        "--border": `${fgHsl} / 0.2`,
        "--input": `${fgHsl} / 0.2`,
      })}
    >
      {children}
    </View>
  )
}
