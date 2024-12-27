import { PayloadAction, createSlice } from "@reduxjs/toolkit"
import { HighlightTint } from "../../colors"
import deepmerge from "deepmerge"
import { WritableDraft } from "immer/dist/internal"

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
  // scroll: boolean
}

type AudioPreferences = {
  speed: number
}

export type BookPreferences = {
  typography?: Partial<TypographyPreferences>
  layout?: Partial<LayoutPreferences>
  audio?: Partial<AudioPreferences>
}

export type PreferencesState = {
  darkMode: boolean | "auto"
  colorThemes: ColorTheme[]
  lightTheme: string
  darkTheme: string
  typography: TypographyPreferences
  layout: LayoutPreferences
  readaloudColor: HighlightTint
  bookPreferences: Record<number, BookPreferences>
}

export const defaultPreferences: Omit<PreferencesState, "bookPreferences"> = {
  darkMode: "auto",
  colorThemes: [
    {
      name: "Day",
      foreground: "#111111",
      background: "#FFFFFF",
      isDark: false,
    },
    {
      name: "Night",
      foreground: "#DDDDDD",
      background: "#111111",
      isDark: true,
    },
  ],
  lightTheme: "Day",
  darkTheme: "Night",
  typography: {
    scale: 1.0,
    lineHeight: 1.4,
    alignment: "justify",
    fontFamily: "Bookerly",
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
}

const initialState: PreferencesState = {
  ...defaultPreferences,
  bookPreferences: {},
}

export const preferencesSlice = createSlice({
  name: "preferences",
  initialState,
  reducers: {
    preferencesHydrated(_state, action: PayloadAction<PreferencesState>) {
      return action.payload
    },
    globalPreferencesUpdated(
      state,
      action: PayloadAction<Partial<PreferencesState>>,
    ) {
      return { ...state, ...action.payload }
    },
    playerSpeedChanged(
      state,
      action: PayloadAction<{ bookId: number; speed: number }>,
    ) {
      const { bookId, speed } = action.payload

      const book = state.bookPreferences[bookId]
      if (!book) return

      book.audio = {
        ...book.audio,
        speed,
      }
    },
    bookPreferencesUpdated(
      state,
      action: PayloadAction<{
        bookId: number
        prefs: Partial<BookPreferences>
      }>,
    ) {
      const { bookId, prefs } = action.payload

      const book = state.bookPreferences[bookId] ?? {}

      state.bookPreferences[bookId] = {
        ...book,
        ...prefs,
      }
    },
    bookPreferencesSetAsDefaults(
      state,
      action: PayloadAction<{ bookId: number }>,
    ) {
      const { bookId } = action.payload

      const book = state.bookPreferences[bookId]
      if (!book) return

      const { typography, layout } = book

      return deepmerge(state, {
        typography,
        layout,
      } as WritableDraft<BookPreferences>)
    },
    typographyPreferencesReset(state) {
      state.typography = defaultPreferences.typography
    },
  },
})
