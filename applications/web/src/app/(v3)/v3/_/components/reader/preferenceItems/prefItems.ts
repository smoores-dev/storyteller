import {
  type FontFamily,
  type HighlightColor,
  type SpacingMode,
} from "@/store/slices/preferencesSlice"

export const highlightColors = [
  {
    value: "yellow",
    label: "Yellow",
    icon: "🟡",
    className: "bg-reader-highlight-yellow",
  },
  {
    value: "red",
    label: "Red",
    icon: "🟥",
    className: "bg-reader-highlight-red",
  },
  {
    value: "green",
    label: "Green",
    icon: "🟢",
    className: "bg-reader-highlight-green",
  },
  {
    value: "blue",
    label: "Blue",
    icon: "🟦",
    className: "bg-reader-highlight-blue",
  },
  {
    value: "magenta",
    label: "Magenta",
    icon: "🟪",
    className: "bg-reader-highlight-magenta",
  },
  {
    value: "custom",
    label: "Custom",
    icon: "🎨",
    className: "bg-reader-highlight-custom",
  },
] as const satisfies {
  value: HighlightColor
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
