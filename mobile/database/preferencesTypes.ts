import { colors } from "@/components/ui/tokens/colors"

export const defaultPreferences: Preferences = {
  darkMode: "auto",
  showReaderUi: false,
  colorThemes: [
    {
      name: "Day",
      foreground: colors.gray9,
      background: colors.white,
      isDark: false,
    },
    {
      name: "Sepia",
      foreground: colors.brown9,
      background: colors.yellow0,
      isDark: false,
    },
    {
      name: "Crisp White",
      foreground: colors.black,
      background: colors.white,
      isDark: false,
    },
    {
      name: "Night",
      foreground: colors.gray3,
      background: colors.gray9,
      isDark: true,
    },
  ],
  lightTheme: "Day",
  darkTheme: "Night",
  typography: {
    scale: 1.0,
    lineHeight: 1.4,
    alignment: "justify",
    fontFamily: "Literata",
  },
  layout: {
    margins: {
      vertical: 1.0,
      horizontal: 1.0,
    },
    columns: "auto",
    animation: true,
  },
  readaloudColor: "yellow",
  customFonts: [],
  automaticRewind: {
    enabled: true,
    afterInterruption: 3,
    afterBreak: 10,
  },
  hideStatusbar: {
    enabled: true,
  },
}

export type ColorTheme = {
  name: string
  foreground: string
  background: string
  isDark: boolean
}

type TypographyPreferences = {
  scale: number
  lineHeight: number
  alignment: "left" | "justify"
  fontFamily: string
}

type LayoutPreferences = {
  margins: {
    vertical: number
    horizontal: number
  }
  columns: 1 | 2 | "auto"
  animation: boolean
  // scroll: boolean
}

type AudioPreferences = {
  speed: number
}

type AutomaticRewindPreferences = {
  enabled: boolean
  afterInterruption: number
  afterBreak: number
}

export interface BookPreferences {
  typography?: Partial<TypographyPreferences>
  layout?: Partial<LayoutPreferences>
  audio?: Partial<AudioPreferences>
  detailView?: {
    mode: "audio" | "text"
    scope: "chapter" | "book"
  }
}

export type CustomFont = {
  filename: string
  name: string
  type: "ttf" | "otf"
}

export type HideStatusbarPreferences = {
  enabled: boolean
}

export interface Preferences {
  darkMode: boolean | "auto"
  colorThemes: ColorTheme[]
  showReaderUi: boolean
  lightTheme: string
  darkTheme: string
  typography: TypographyPreferences
  layout: LayoutPreferences
  readaloudColor: string
  customFonts: CustomFont[]
  hideStatusbar: HideStatusbarPreferences
  automaticRewind: AutomaticRewindPreferences
}
