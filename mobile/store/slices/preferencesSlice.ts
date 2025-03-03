import { PayloadAction, createSlice } from "@reduxjs/toolkit"
import { HighlightTint } from "../../colors"
import deepmerge from "deepmerge"
import { WritableDraft } from "immer/dist/internal"
import { colors } from "../../components/ui/tokens/colors"

type ColorTheme = {
  name: string
  foreground: string
  background: string
  surface: string
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
  detailView?: {
    mode: "audio" | "text"
    scope: "chapter" | "book"
  }
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
      foreground: colors.gray9,
      background: colors.white,
      surface: colors.gray2,
      isDark: false,
    },
    {
      name: "Sepia",
      foreground: colors.brown9,
      background: colors.yellow0,
      surface: colors.brown2,
      isDark: false,
    },
    {
      name: "Night",
      foreground: colors.gray3,
      background: colors.gray9,
      surface: colors.gray7,
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
    bookDetailImagePressed(state, action: PayloadAction<{ bookId: number }>) {
      const { bookId } = action.payload

      const book = state.bookPreferences[bookId] ?? {}
      const detailPrefs = book.detailView ?? { mode: "text", scope: "chapter" }
      detailPrefs.mode = detailPrefs.mode === "audio" ? "text" : "audio"
      book.detailView = detailPrefs
      state.bookPreferences[bookId] = book
    },
    bookDetailPositionPressed(
      state,
      action: PayloadAction<{ bookId: number }>,
    ) {
      const { bookId } = action.payload

      const book = state.bookPreferences[bookId] ?? {}
      const detailPrefs = book.detailView ?? { mode: "text", scope: "chapter" }
      detailPrefs.scope = detailPrefs.scope === "book" ? "chapter" : "book"
      book.detailView = detailPrefs
      state.bookPreferences[bookId] = book
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
    customThemeSaved(state, action: PayloadAction<{ theme: ColorTheme }>) {
      state.colorThemes.push(action.payload.theme)
    },
  },
})
