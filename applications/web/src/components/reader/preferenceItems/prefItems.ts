import {
  type FontFamily,
  type HighlightColor,
  READER_THEMES,
  type ReadingTheme,
  type ReadingThemeScheme,
  type SpacingMode,
} from "@/store/slices/preferencesSlice"

export type ReadingThemeOption = {
  value: ReadingTheme
  label: string
  group: ReadingThemeScheme
  bg: string
  text: string
  attributes: { "data-reader-theme": ReadingTheme }
}

export const readingThemes: ReadingThemeOption[] = READER_THEMES.map(
  (theme) => ({
    value: theme.id,
    label: theme.label,
    group: theme.scheme,
    bg: "bg-reader-bg border-reader-border border",
    text: "text-reader-text",
    attributes: { "data-reader-theme": theme.id },
  }),
)

export const lightReadingThemes = readingThemes.filter(
  (theme) => theme.group === "light",
)

export const darkReadingThemes = readingThemes.filter(
  (theme) => theme.group === "dark",
)

export const highlightColors = [
  // {
  //   value: "yellow",
  //   label: "Yellow",
  //   icon: "🟡",
  //   className: "bg-reader-highlight-yellow",
  // },
  // {
  //   value: "red",
  //   label: "Red",
  //   icon: "🟥",
  //   className: "bg-reader-highlight-red",
  // },
  // {
  //   value: "green",
  //   label: "Green",
  //   icon: "🟢",
  //   className: "bg-reader-highlight-green",
  // },
  // {
  //   value: "blue",
  //   label: "Blue",
  //   icon: "🟦",
  //   className: "bg-reader-highlight-blue",
  // },
  // {
  //   value: "magenta",
  //   label: "Magenta",
  //   icon: "🟪",
  //   className: "bg-reader-highlight-magenta",
  // },
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
