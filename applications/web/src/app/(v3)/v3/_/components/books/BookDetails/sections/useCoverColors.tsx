// TODO: deprecae in favor of coverscope
import { useTheme } from "next-themes"
import { useMemo } from "react"

import { type JsColor } from "@storyteller-platform/okmain"

import { useUserPreferences } from "@v3/_/components/user-preferences-provider"

import {
  type Audiobook,
  type BookWithRelations,
  type Ebook,
  type Readaloud,
} from "@/database/books"
import {
  type ColorMode,
  NEUTRAL_COLOR_STRENGTH,
} from "@/database/userPreferencesTypes"

export type CoverColor = {
  rgb: { r: number; g: number; b: number }
  // perceived luminance, 0-255
  luminance: number
  isDark: boolean
  // "rgb(r,g,b)"
  solid: string
  // "rgba(r,g,b,a)" at the given opacity
  alpha: (a: number) => string
  // readable text color to sit on top of solid
  onColor: string
}

export type CoverColors = {
  primary: CoverColor
  accent: CoverColor
  palette: CoverColor[]
  hasColors: boolean
}

export type CoverType = "ebook" | "audiobook" | "readaloud"

function luminance(color: JsColor): number {
  return Math.round(color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722)
}

// crude contrast ratio between two luminance values (0-255 scale)
export function contrastRatio(a: number, b: number): number {
  const lighter = Math.max(a, b)
  const darker = Math.min(a, b)
  return (lighter + 0.05) / (darker + 0.05)
}

function toCoverColor(color: JsColor): CoverColor {
  const { r, g, b } = color
  const lum = luminance(color)
  return {
    rgb: { r, g, b },
    luminance: lum,
    isDark: lum < 128,
    solid: `rgb(${r}, ${g}, ${b})`,
    alpha: (a: number) => `rgba(${r}, ${g}, ${b}, ${a})`,
    onColor: lum < 128 ? "#fff" : "#000",
  }
}

const FALLBACK: CoverColor = {
  rgb: { r: 0, g: 0, b: 0 },
  luminance: 0,
  isDark: true,
  solid: "var(--primary)",
  alpha: (a: number) =>
    `color-mix(in srgb, var(--primary) ${a * 100}%, transparent)`,
  onColor: "var(--primary-foreground)",
}

const FALLBACK_COLORS: CoverColors = {
  primary: FALLBACK,
  accent: FALLBACK,
  palette: [FALLBACK],
  hasColors: false,
}

function resolveColors(
  bookOrColors: CoverColorsBook | JsColor[],
  type?: CoverType,
): JsColor[] {
  if (Array.isArray(bookOrColors)) return bookOrColors
  // a per-format query wants that format's real colors, never the override
  if (type) return bookOrColors[type]?.coverColors ?? []
  return (
    bookOrColors.coverColorsOverride ??
    bookOrColors.ebook?.coverColors ??
    bookOrColors.audiobook?.coverColors ??
    bookOrColors.readaloud?.coverColors ??
    []
  )
}

export type CoverColorsBook = {
  coverColorsOverride: JsColor[] | null
  readaloud: Pick<Readaloud, "coverColors" | "status"> | null
  ebook: Pick<Ebook, "coverColors" | "updatedAt"> | null
  audiobook: Pick<Audiobook, "coverColors" | "updatedAt"> | null
}

export function useCoverColors(colors: JsColor[]): CoverColors
export function useCoverColors(
  book: CoverColorsBook | undefined,
  options?: { type?: CoverType },
): CoverColors
export function useCoverColors(
  bookOrColors: CoverColorsBook | JsColor[] | undefined,
  options?: { type?: CoverType },
): CoverColors {
  const type = options?.type

  return useMemo(() => {
    const colors = bookOrColors ? resolveColors(bookOrColors, type) : []
    const [primary, ...rest] = colors.map(toCoverColor)
    if (!primary) return FALLBACK_COLORS

    // pick the swatch that reads most distinctly against the primary
    const accent = rest.reduce((best, candidate) => {
      const ratio = contrastRatio(candidate.luminance, primary.luminance)
      const bestRatio = contrastRatio(best.luminance, primary.luminance)
      return ratio > 2 && ratio > bestRatio ? candidate : best
    }, primary)

    return { primary, accent, palette: [primary, ...rest], hasColors: true }
  }, [bookOrColors, type])
}

const LIGHT_SURFACE = 250
const DARK_SURFACE = 28
const MIN_CONTRAST = 3.2

function clamp8(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}

export type ContrastColor = {
  // the (possibly adjusted) color, "rgb(r,g,b)"
  solid: string
  // the same color as space-separated channels, "r g b", for use in css
  // rgb(var(--x) / a) and color-mix(rgb(var(--x)) ...) expressions
  channels: string
  // readable text/icon color to sit on top of solid
  onColor: string
}

export function ensureContrast(
  color: CoverColor,
  isDarkMode: boolean,
): ContrastColor {
  return ensureContrastAgainst(color, isDarkMode ? DARK_SURFACE : LIGHT_SURFACE)
}

export function ensureContrastAgainst(
  color: CoverColor,
  surface: number,
): ContrastColor {
  const surfaceIsDark = surface < 128
  let { r, g, b } = color.rgb

  const lum = () => r * 0.2126 + g * 0.7152 + b * 0.0722

  for (let i = 0; i < 16; i++) {
    const cr = contrastRatio(lum(), surface)
    if (cr >= MIN_CONTRAST) break

    if (surfaceIsDark) {
      // step toward white
      r = clamp8(r + (255 - r) * 0.12)
      g = clamp8(g + (255 - g) * 0.12)
      b = clamp8(b + (255 - b) * 0.12)
    } else {
      // step toward black
      r = clamp8(r * 0.85)
      g = clamp8(g * 0.85)
      b = clamp8(b * 0.85)
    }
  }

  return {
    solid: `rgb(${r}, ${g}, ${b})`,
    channels: `${r} ${g} ${b}`,
    onColor: lum() < 140 ? "#fff" : "#000",
  }
}

const MAX_INTENSITY_MULTIPLIER = 1.5

export type ColorPreferences = {
  level: ColorMode
  intensity: number
  strength: number
  showTint: boolean
  showAccent: boolean
  tint: (color: CoverColor, base: number) => string
}

export function useColorPreferences(): ColorPreferences {
  const { colorMode, colorIntensity } = useUserPreferences()

  return useMemo(() => {
    const showTint = colorMode !== "minimal"
    const intensity = Math.min(
      colorIntensity / NEUTRAL_COLOR_STRENGTH,
      MAX_INTENSITY_MULTIPLIER,
    )
    return {
      level: colorMode,
      intensity,
      strength: colorIntensity,
      showTint,
      showAccent: colorMode === "full",
      tint: (color, base) =>
        showTint ? color.alpha(Math.min(base * intensity, 1)) : "transparent",
    }
  }, [colorMode, colorIntensity])
}

// the hero gradient paints the cover color (via --cover-header, an
// intensity-scaled blend against the page surface) behind arbitrary text, so
// the tinted text tokens have to be re-derived against that blend rather than
// the page background. returns css vars to spread on the hero container.
export function useHeroContrast(
  book: BookWithRelations | undefined,
): React.CSSProperties {
  const { primary, hasColors } = useCoverColors(book)
  const { intensity, showTint } = useColorPreferences()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  if (!hasColors || !showTint) return {}

  const surface = isDark ? DARK_SURFACE : LIGHT_SURFACE
  const alpha = isDark ? 0.7 : 0.8
  const headerFrac = Math.min((isDark ? 0.8 : 0.5) * intensity, 0.96)
  const wellFrac = Math.min((isDark ? 0.7 : 0.3) * intensity, 0.96)
  const blend = (frac: number) => {
    const colorLum = surface + (primary.luminance - surface) * frac
    return surface * (1 - alpha) + colorLum * alpha
  }
  const heroLum = (blend(headerFrac) + blend(wellFrac)) / 2

  const tinted = ensureContrastAgainst(primary, heroLum)
  const heroIsDark = heroLum < 128

  return {
    "--tinted-foreground": tinted.solid,
    // "--tinted-foreground": heroIsDark ? tinted.onColor : tinted.solid,
    "--tinted-foreground-strong": heroIsDark ? "#fff" : "#000",

    // ...(intensity > 0.5 && {
    "--cover-background-mix": isDark ? "black" : "white",
    // }),
    // "--tinted-foreground-subtle": tinted.onColor,
    // // plain body/muted text inside the hero also has to clear the blend
    // "--foreground": heroIsDark ? "oklch(0.98 0 0)" : "oklch(0.15 0 0)",
    // "--muted-foreground": heroIsDark
    //   ? "oklch(0.85 0 0 / 0.85)"
    //   : "oklch(0.3 0 0 / 0.85)",
  } as React.CSSProperties
}

// i neeed to
// - look at hero gradient
// - check if its dark or light
//   - if dark, it means the accent color is too dark. all text on top of it should be made lighter. in dark mode this is easy, bc the foreground color is already light. in light mode this is harder, bc the foreground color is already dark.
// - vice versa for light mode
// so i basically need a theme independent mode. not really, bc the header bg is diff in light and dark mode.
// i just need to do the same checks in light as in dark mode
// then theres the issue that i use eg the primary color for buttons later down the line
// these liely also need to eb lightened/darkened
