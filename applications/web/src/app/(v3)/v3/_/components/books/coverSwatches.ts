import { type JsColor } from "@storyteller-platform/okmain"

import { type Audiobook, type Ebook, type Readaloud } from "@/database/books"

export type CoverType = "ebook" | "audiobook" | "readaloud"

type WithCoverImage<Relation> = Relation & {
  coverImage: { colors: JsColor[] | null } | null
}

export type CoverColorsBook = {
  coverColorsOverride: JsColor[] | null
  readaloud: WithCoverImage<Pick<Readaloud, "status">> | null
  ebook: WithCoverImage<Pick<Ebook, "updatedAt">> | null
  audiobook: WithCoverImage<Pick<Audiobook, "updatedAt">> | null
}

export type Swatch = {
  rgb: { r: number; g: number; b: number }
  /* "rgb(r g b)" */
  css: string
  /* perceived luminance on a 0-255 scale */
  luminance: number
  isDark: boolean
  /* readable text color to sit directly on the raw swatch */
  onColor: string
}

export type CoverSwatches = {
  primary: Swatch
  secondary: Swatch
  palette: Swatch[]
  hasColors: boolean
}

function luminance(color: JsColor): number {
  return Math.round(color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722)
}

export function contrastRatio(a: number, b: number): number {
  const lighter = Math.max(a, b)
  const darker = Math.min(a, b)
  return (lighter + 0.05) / (darker + 0.05)
}

export function toSwatch(color: JsColor): Swatch {
  const { r, g, b } = color
  const lum = luminance(color)
  return {
    rgb: { r, g, b },
    css: `rgb(${r} ${g} ${b})`,
    luminance: lum,
    isDark: lum < 128,
    onColor: lum < 140 ? "#fff" : "#000",
  }
}

const FALLBACK: Swatch = {
  rgb: { r: 0, g: 0, b: 0 },
  css: "var(--primary)",
  luminance: 0,
  isDark: true,
  onColor: "var(--primary-foreground)",
}

const FALLBACK_SWATCHES: CoverSwatches = {
  primary: FALLBACK,
  secondary: FALLBACK,
  palette: [FALLBACK],
  hasColors: false,
}

export function resolveCoverColors(
  bookOrColors: CoverColorsBook | JsColor[],
  type?: CoverType,
): JsColor[] {
  if (Array.isArray(bookOrColors)) return bookOrColors
  if (type) return bookOrColors[type]?.coverImage?.colors ?? []
  return (
    bookOrColors.coverColorsOverride ??
    bookOrColors.ebook?.coverImage?.colors ??
    bookOrColors.audiobook?.coverImage?.colors ??
    bookOrColors.readaloud?.coverImage?.colors ??
    []
  )
}

export function coverSwatches(colors: JsColor[]): CoverSwatches {
  const [primary, ...rest] = colors.map(toSwatch)
  if (!primary) return FALLBACK_SWATCHES

  const secondary = rest.reduce((best, candidate) => {
    const ratio = contrastRatio(candidate.luminance, primary.luminance)
    const bestRatio = contrastRatio(best.luminance, primary.luminance)
    return ratio > 2 && ratio > bestRatio ? candidate : best
  }, primary)

  return { primary, secondary, palette: [primary, ...rest], hasColors: true }
}

export function bookCoverSwatches(
  book: CoverColorsBook | undefined,
  type?: CoverType,
): CoverSwatches {
  return coverSwatches(book ? resolveCoverColors(book, type) : [])
}
