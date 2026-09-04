import {
  type FontFamily,
  type HighlightColor,
  type HighlightStyle,
  type SpacingMode,
} from "@/store/slices/preferencesSlice"

export const highlightStyles = [
  {
    value: "highlight",
    labelKey: "styleHighlight",
    className: "bg-reader-highlight",
  },
  {
    value: "highlightUnderline",
    labelKey: "styleHighlightUnderline",
    className: "bg-reader-highlight/40 border-reader-highlight-mid border-b-2",
  },
  {
    value: "underline",
    labelKey: "styleUnderline",
    className: "border-reader-highlight-strong border-b-2",
  },
  {
    value: "textColor",
    labelKey: "styleTextColor",
    className: "bg-reader-highlight-strong",
  },
] as const satisfies {
  value: HighlightStyle
  labelKey: string
  className: string
}[]

export const highlightColors = [
  {
    value: "yellow",
    icon: "🟡",
    className: "bg-reader-highlight-yellow",
  },
  {
    value: "red",
    icon: "🟥",
    className: "bg-reader-highlight-red",
  },
  {
    value: "green",
    icon: "🟢",
    className: "bg-reader-highlight-green",
  },
  {
    value: "blue",
    icon: "🟦",
    className: "bg-reader-highlight-blue",
  },
  {
    value: "magenta",
    icon: "🟪",
    className: "bg-reader-highlight-magenta",
  },
  {
    value: "cover",
    icon: "📚",
    className: "bg-reader-highlight-cover",
  },
  {
    value: "custom",
    icon: "🎨",
    className: "bg-reader-highlight-custom",
  },
] as const satisfies {
  value: HighlightColor
  icon: string
  className: string
}[]

export const spacingModes = [
  { value: "default", icon: "|||" },
  { value: "tight", icon: "||" },
  { value: "balanced", icon: "| |" },
  { value: "loose", icon: "|  |" },
] as const satisfies {
  value: SpacingMode
  icon: string
}[]

export const fontFamilies = [
  { value: "publisher" },
  { value: "Literata" },
  { value: "OpenDyslexic" },
  { value: "serif" },
  { value: "sans-serif" },
  { value: "monospace" },
  { value: "custom" },
] as const satisfies {
  value: FontFamily
}[]
