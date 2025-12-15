import {
  type FontFamily,
  type ReadingPreferences,
  type ReadingTheme,
  type SpacingMode,
} from "@/store/slices/preferencesSlice"

export const readingThemes = [
  {
    value: "light",
    label: "Light",
    bg: "bg-white border",
    text: "text-gray-900",
  },
  { value: "paper", label: "Paper", bg: "bg-amber-50", text: "text-amber-900" },
  {
    value: "sepia",
    label: "Sepia",
    bg: "bg-yellow-50",
    text: "text-yellow-900",
  },
  {
    value: "auto",
    label: "Auto",
    bg: "bg-gradient-to-br from-white to-gray-900",
    text: "text-gray-900",
  },
  { value: "dark", label: "Dark", bg: "bg-gray-900", text: "text-gray-50" },
  {
    value: "cattpuccin",
    label: "Catppuccin",
    bg: "bg-slate-700",
    text: "text-slate-50",
  },
] as const satisfies {
  value: ReadingTheme
  label: string
  bg: string
  text: string
}[]

export const highlightColors = [
  {
    value: "yellow",
    label: "Yellow",
    icon: "🟡",
    className: "bg-reader-highlight-color-yellow",
  },
  {
    value: "red",
    label: "Red",
    icon: "🟥",
    className: "bg-reader-highlight-color-red",
  },
  {
    value: "green",
    label: "Green",
    icon: "🟢",
    className: "bg-reader-highlight-color-green",
  },
  {
    value: "blue",
    label: "Blue",
    icon: "🟦",
    className: "bg-reader-highlight-color-blue",
  },
  {
    value: "magenta",
    label: "Magenta",
    icon: "🟪",
    className: "bg-reader-highlight-color-magenta",
  },
  {
    value: "custom",
    label: "Custom",
    icon: "🎨",
    className: "bg-reader-highlight-color-custom",
  },
] as const satisfies {
  value: ReadingPreferences["highlightColor"]
  label: string
  icon: string
  className: string
}[]

export const spacingModes = [
  { value: "default", label: "Default", icon: "|||" },
  { value: "tight", label: "Tight", icon: "||" },
  { value: "balanced", label: "Balanced", icon: "| |" },
  { value: "loose", label: "Loose", icon: "|  |" },
] as const satisfies {
  value: SpacingMode
  label: string
  icon: string
}[]

export const fontFamilies = [
  { value: "publisher", label: "Publisher's font" },
  { value: "Literata", label: "Literata" },
  { value: "OpenDyslexic", label: "OpenDyslexic" },
  { value: "serif", label: "Serif" },
  { value: "sans-serif", label: "Sans-serif" },
  { value: "monospace", label: "Monospace" },
  { value: "custom", label: "Custom" },
] as const satisfies {
  value: FontFamily
  label: string
}[]
