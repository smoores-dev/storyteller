import AsyncStorage from "@react-native-async-storage/async-storage"

import { colors } from "@/components/ui/tokens/colors"

// This is intentionally "frozen", because this
// is used to fill in missing preferences during the initial
// migration. We want it to remain static so that all
// users come out of the initial migration with the same
// preferences, even if we evolve preferences over time
// in later migrations.
const defaultPreferences: Omit<PreferencesState, "bookPreferences"> = {
  darkMode: "auto",
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

type ColorTheme = {
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
}

type AudioPreferences = {
  speed: number
}

type AutomaticRewindPreferences = {
  enabled: boolean
  afterInterruption: number
  afterBreak: number
}

type BookPreferences = {
  typography?: Partial<TypographyPreferences>
  layout?: Partial<LayoutPreferences>
  audio?: Partial<AudioPreferences>
  detailView?: {
    mode: "audio" | "text"
    scope: "chapter" | "book"
  }
}

type CustomFont = {
  uri: string
  name: string
  type: "ttf" | "otf"
}

type HideStatusbarPreferences = {
  enabled: boolean
}

type PreferencesState = {
  darkMode: boolean | "auto"
  colorThemes: ColorTheme[]
  lightTheme: string
  darkTheme: string
  typography: TypographyPreferences
  layout: LayoutPreferences
  readaloudColor: string
  bookPreferences: Record<number, BookPreferences>
  customFonts: CustomFont[]
  hideStatusbar: HideStatusbarPreferences
  automaticRewind: AutomaticRewindPreferences
}

export async function readGlobalPreferences(): Promise<null | Omit<
  PreferencesState,
  "bookPreferences" | "customFonts"
>> {
  const stored = await AsyncStorage.getItem("preferences")
  if (!stored) return defaultPreferences

  const preferences = JSON.parse(stored) as Omit<
    PreferencesState,
    "bookPreferences"
  >

  // Ensure that user preferences contain new automaticRewind settings
  if (!preferences.automaticRewind) {
    preferences.automaticRewind = defaultPreferences.automaticRewind
  }

  // Ensure that user preferences contain new hideStatusbar settings
  if (!preferences.hideStatusbar) {
    preferences.hideStatusbar = defaultPreferences.hideStatusbar
  }

  if (preferences.typography.fontFamily === "Bookerly") {
    preferences.typography.fontFamily = "Literata"
  }

  // Ensure that new default themes get added to user preferences
  defaultPreferences.colorThemes.forEach((theme) => {
    const existingTheme = preferences.colorThemes.find(
      (t) => t.name === theme.name,
    )
    if (existingTheme) {
      existingTheme.background = theme.background
      existingTheme.foreground = theme.foreground
      existingTheme.isDark = theme.isDark
      return
    }

    preferences.colorThemes.push(theme)
  })

  return preferences
}

export async function writeGlobalPreferences(
  preferences: Omit<PreferencesState, "bookPreferences">,
) {
  return AsyncStorage.setItem("preferences", JSON.stringify(preferences))
}

export async function readBookPreferences(
  bookId: number,
): Promise<null | BookPreferences> {
  const stored = await AsyncStorage.getItem(`preferences.${bookId}`)
  if (!stored) return null

  return JSON.parse(stored)
}

export async function writeBookPreferences(
  bookId: number,
  preferences: BookPreferences,
) {
  return AsyncStorage.setItem(
    `preferences.${bookId}`,
    JSON.stringify(preferences),
  )
}

export async function deleteBookPreferences(bookId: number) {
  return AsyncStorage.removeItem(`preferences.${bookId}`)
}
