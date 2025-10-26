import { type EpubPreferences, TextAlignment } from "@readium/navigator"
import {
  type PayloadAction,
  createSelector,
  createSlice,
} from "@reduxjs/toolkit"

import { isSafari } from "@/components/reader/helpers"
import { type UUID } from "@/uuid"

import { type RootState } from "../appState"

import { selectCurrentBook, selectReadingMode } from "./readingSessionSlice"

export type FontFamily =
  | "publisher"
  | "serif"
  | "sans-serif"
  | "monospace"
  | "custom"
  | "Literata"
  | "OpenDyslexic"

export type SpacingMode = "default" | "tight" | "balanced" | "loose"
export type LayoutMode = "paginated" | "scrollable"
export type ReadingTheme =
  | "auto"
  | "light"
  | "sepia"
  | "paper"
  | "dark"
  | "cattpuccin"

export type ColumnMode = "auto" | "1col" | "2cols"

export type EdgePosition = {
  horizontalEdge: "left" | "right"
  verticalEdge: "top" | "bottom"
  horizontalOffset: number
  verticalOffset: number
}

export type ReadingPreferences = {
  currentlyListeningBookId: UUID | null
  fontSize: number
  fontWeight: number
  fontFamily: FontFamily
  theme: ReadingTheme
  align: TextAlignment
  spacing: SpacingMode
  layout: LayoutMode
  columns: number | null
  playbackSpeed: number
  lineHeight: number
  paragraphSpacing: number
  lineLength: number
  paragraphIndent: number
  hyphens: boolean
  highlightColor: "yellow" | "red" | "green" | "blue" | "magenta" | "custom"
  detailView: {
    mode: "audio" | "text"
    scope: "book" | "chapter"
  }
  customHighlightColor: string
  // in seconds, how much to offset the audio position to the text position when syncing
  syncOffset: number
  neverShowMiniPlayer: boolean
  minimizedMiniPlayer: boolean
  pinnedMiniPlayer: boolean
  miniPlayerPosition: EdgePosition | null
  customFontFamily: {
    url: string
    name: string
  }
  volume: number
}

// future: per-book overrides
// type PreferencesState = {
//   global: ReadingPreferences
//   perBook: Record<UUID, Partial<ReadingPreferences>>
// }

const GLOBAL_ONLY_PREFERENCES = [
  "currentlyListeningBookId",
  "minimizedMiniPlayer",
  "neverShowMiniPlayer",
  "pinnedMiniPlayer",
  "miniPlayerPosition",
] as const
type GLOBAL_ONLY_PREFERENCE = (typeof GLOBAL_ONLY_PREFERENCES)[number]

type PreferencesState = {
  global: ReadingPreferences
  perBook: Omit<
    Record<UUID, Partial<ReadingPreferences>>,
    GLOBAL_ONLY_PREFERENCE
  >
}

export const defaultPreferences: ReadingPreferences = {
  currentlyListeningBookId: null,
  fontSize: 100,
  fontFamily: "publisher",
  theme: "auto",
  align: TextAlignment.justify,
  spacing: "default",
  layout: "paginated",
  columns: 0, // 0 means auto
  playbackSpeed: 1.0,
  lineHeight: 1.3,
  paragraphSpacing: 0,
  lineLength: 65,
  paragraphIndent: 0,
  hyphens: true,
  highlightColor: "yellow",
  detailView: {
    mode: "audio",
    scope: "chapter",
  },
  customHighlightColor: "rgba(255, 255, 255, 0.3)",
  syncOffset: 0.0,
  neverShowMiniPlayer: false,
  minimizedMiniPlayer: false,
  pinnedMiniPlayer: false,
  miniPlayerPosition: null,
  volume: 100,
  fontWeight: 400,
  customFontFamily: {
    url: "https://fonts.googleapis.com/css2?family=Crimson+Text:ital,wght@0,400;0,600;0,700;1,400;1,600;1,700&display=swap",
    name: "Crimson Text",
  },
}

const initialState: PreferencesState = {
  global: defaultPreferences,
  perBook: {},
}

const setTargetPreference = <K extends keyof ReadingPreferences>(
  state: PreferencesState,
  target: "global" | UUID,
  key: K,
  value: ReadingPreferences[K],
) => {
  if (target === "global") {
    state.global[key] = value
    return
  }

  if (!state.perBook[target]) {
    state.perBook[target] = {}
  }

  state.perBook[target][key] = value
}

export type PreferencePayload = {
  [K in keyof ReadingPreferences]: {
    key: K
    value: ReadingPreferences[K]
    target: K extends GLOBAL_ONLY_PREFERENCE ? "global" : UUID | "global"
  }
}[keyof ReadingPreferences]

export const preferencesSlice = createSlice({
  name: "preferences",
  initialState,

  reducers: {
    // hydrate from localStorage (used on app startup)
    initGlobalPreferences: (
      state,
      action: PayloadAction<{ preferences: Partial<ReadingPreferences> }>,
    ) => {
      const { preferences } = action.payload
      state.global = {
        ...defaultPreferences,
        ...state.global,
        ...preferences,
      }
    },

    // we discard all the other book preferences: we are reading another book
    initBookPreferences: (
      state,
      action: PayloadAction<{
        preferences: Partial<ReadingPreferences>
        bookId: UUID
      }>,
    ) => {
      const { preferences, bookId } = action.payload

      state.perBook = { [bookId]: preferences }
    },

    updatePreference: (
      state: PreferencesState,
      action: PayloadAction<PreferencePayload>,
    ) => {
      const { key, value, target } = action.payload

      setTargetPreference(state, target, key, value)
    },

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
    resetPreference: <K extends keyof ReadingPreferences>(
      state: PreferencesState,
      action: PayloadAction<{
        key: K
        target: UUID | "global"
      }>,
    ) => {
      const { key, target } = action.payload
      if (target === "global") {
        state.global[key] = defaultPreferences[key]
        return
      }

      if (!state.perBook[target]) {
        return
      }

      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete state.perBook[target][key]
    },

    // reset to defaults
    resetPreferences: (state) => {
      state.global = defaultPreferences
      state.perBook = {}
    },

    incrementPlaybackRate: (
      state,
      action: PayloadAction<{ target: UUID | "global"; value: number }>,
    ) => {
      const { target, value } = action.payload
      const currentSpeed =
        target === "global"
          ? state.global.playbackSpeed
          : state.perBook[target]?.playbackSpeed ?? state.global.playbackSpeed
      setTargetPreference(state, target, "playbackSpeed", currentSpeed + value)
    },

    toggleBookDetailView: (
      state,
      action: PayloadAction<{
        target: UUID | "global"
        mode: "audiobook" | "epub" | "readaloud"
      }>,
    ) => {
      const { mode, target } = action.payload

      const detailView =
        target === "global"
          ? state.global.detailView
          : state.perBook[target]?.detailView ?? {
              mode: "text",
              scope: "chapter",
            }

      if (detailView.mode === "audio") {
        if (detailView.scope === "book") {
          setTargetPreference(state, target, "detailView", {
            mode: "audio",
            scope: "chapter",
          })

          // don't show text mode for audiobook
        } else if (mode === "audiobook") {
          setTargetPreference(state, target, "detailView", {
            mode: "audio",
            scope: "book",
          })
        } else {
          setTargetPreference(state, target, "detailView", {
            mode: "text",
            scope: "book",
          })
        }
      }
      if (detailView.mode === "text") {
        if (detailView.scope === "book") {
          setTargetPreference(state, target, "detailView", {
            mode: "text",
            scope: "chapter",
          })
        } else if (mode === "epub") {
          setTargetPreference(state, target, "detailView", {
            mode: "text",
            scope: "book",
          })
        } else {
          setTargetPreference(state, target, "detailView", {
            mode: "audio",
            scope: "book",
          })
        }
      }
    },
  },
})

export const preferencesReducer = preferencesSlice.reducer

export const selectGlobalPreferences = (state: RootState) =>
  state.preferences.global

const selectPreferenceForBook = (state: RootState, bookId: UUID | null) => {
  const currentBook = bookId ?? selectCurrentBook(state)?.uuid

  if (!currentBook) {
    return {}
  }

  return state.preferences.perBook[currentBook]
}

/**
 * defaults to currentbook if no target is provided
 */
export const selectBookPreferences = createSelector(
  selectPreferenceForBook,
  selectGlobalPreferences,
  (preferenceForBook, globalPreferences) => {
    return {
      ...globalPreferences,
      ...preferenceForBook,
    }
  },
)

export const selectPreference = <K extends keyof ReadingPreferences>(
  state: RootState,
  key: K,
  global?: boolean,
) => {
  if (
    global ||
    GLOBAL_ONLY_PREFERENCES.includes(key as GLOBAL_ONLY_PREFERENCE)
  ) {
    return state.preferences.global[key]
  }

  const currentBook = selectCurrentBook(state)

  if (!currentBook) {
    return state.preferences.global[key]
  }

  return (
    state.preferences.perBook[currentBook.uuid]?.[key] ??
    state.preferences.global[key]
  )
}

export const selectEpubPreferences = createSelector(
  selectBookPreferences,
  (preferences) => readiumIfyPreferences(preferences),
)

export const selectDetailView = createSelector(
  selectReadingMode,
  selectBookPreferences,
  (mode, preferences): ReadingPreferences["detailView"] => {
    const detailView = preferences.detailView

    if (mode === "audiobook" && detailView.mode === "text") {
      return { ...detailView, mode: "audio" }
    }
    if (mode === "epub" && detailView.mode === "audio") {
      return { ...detailView, mode: "text" }
    }
    return detailView
  },
)

export const themes = {
  dark: {
    backgroundColor: "0 0% 5.9%",
    textColor: "0 0% 91%",
    uiBackground: "0 0% 5.9%",
    uiSurface: "0 0% 10.2%",
    uiSurfaceHover: "0 0% 14.9%",
    uiBorder: "0 0% 20%",
    uiText: "0 0% 91%",
    uiTextSecondary: "0 0% 63.9%",
    uiTextMuted: "0 0% 45.1%",
    uiAccent: "24.6 95% 53.1%",
    uiAccentHover: "20.5 90.2% 48.2%",
    hightlightColor: {
      yellow: "rgba(255, 255, 0, 0.8)",
      red: "rgba(255, 0, 0, 0.8)",
      green: "rgba(0, 255, 0, 0.8)",
      blue: "rgba(0, 0, 255, 0.8)",
      magenta: "rgba(255, 0, 255, 0.8)",
    },
  },
  light: {
    backgroundColor: "0 0% 100%",
    textColor: "0 0% 0%",
    uiBackground: "0 0% 100%",
    uiSurface: "0 0% 100%",
    uiSurfaceHover: "0 0% 96.1%",
    uiBorder: "0 0% 89.8%",
    uiText: "0 0% 0%",
    uiTextSecondary: "0 0% 32.2%",
    uiTextMuted: "0 0% 45.1%",
    uiAccent: "24.6 95% 53.1%",
    uiAccentHover: "20.5 90.2% 48.2%",
    hightlightColor: {
      yellow: "rgba(255, 255, 0, 0.3)",
      red: "rgba(255, 0, 0, 0.3)",
      green: "rgba(0, 255, 0, 0.3)",
      blue: "rgba(0, 0, 255, 0.3)",
      magenta: "rgba(255, 0, 255, 0.3)",
    },
  },
  sepia: {
    backgroundColor: "42 31.3% 93.7%",
    textColor: "0 0% 17.6%",
    uiBackground: "42 31.3% 93.7%",
    uiSurface: "42 35.7% 89%",
    uiSurfaceHover: "40 37.5% 84.3%",
    uiBorder: "38.2 33.8% 74.5%",
    uiText: "0 0% 17.6%",
    uiTextSecondary: "0 0% 36.5%",
    uiTextMuted: "0 0% 55.3%",
    uiAccent: "26 90.5% 37.1%",
    uiAccentHover: "22.7 82.5% 31.4%",
    hightlightColor: {
      yellow: "rgba(255, 255, 0, 0.3)",
      red: "rgba(255, 0, 0, 0.3)",
      green: "rgba(0, 255, 0, 0.3)",
      blue: "rgba(0, 0, 255, 0.3)",
      magenta: "rgba(255, 0, 255, 0.3)",
    },
  },
  paper: {
    backgroundColor: "40 23.1% 97.5%",
    textColor: "0 0% 10.2%",
    uiBackground: "40 23.1% 97.5%",
    uiSurface: "48 20% 95.1%",
    uiSurfaceHover: "46.7 22% 92%",
    uiBorder: "45 16.2% 85.5%",
    uiText: "0 0% 10.2%",
    uiTextSecondary: "0 0% 29%",
    uiTextMuted: "0 0% 47.8%",
    uiAccent: "17.5 88.3% 40.4%",
    uiAccentHover: "15 79.1% 33.7%",
    hightlightColor: {
      yellow: "rgba(255, 255, 0, 0.3)",
      red: "rgba(255, 0, 0, 0.3)",
      green: "rgba(0, 255, 0, 0.3)",
      blue: "rgba(0, 0, 255, 0.3)",
      magenta: "rgba(255, 0, 255, 0.3)",
    },
  },
  auto: {
    backgroundColor: "0 0% 100%",
    textColor: "0 0% 0%",
    uiBackground: "0 0% 100%",
    uiSurface: "0 0% 100%",
    uiSurfaceHover: "0 0% 96.1%",
    uiBorder: "0 0% 89.8%",
    uiText: "0 0% 0%",
    uiTextSecondary: "0 0% 32.2%",
    uiTextMuted: "0 0% 45.1%",
    uiAccent: "24.6 95% 53.1%",
    uiAccentHover: "20.5 90.2% 48.2%",
    hightlightColor: {
      yellow: "rgba(255, 255, 0, 0.3)",
      red: "rgba(255, 0, 0, 0.3)",
      green: "rgba(0, 255, 0, 0.3)",
      blue: "rgba(0, 0, 255, 0.3)",
      magenta: "rgba(255, 0, 255, 0.3)",
    },
  },
  cattpuccin: {
    backgroundColor: "240 21.3% 12%",
    textColor: "227.4 68.3% 87.6%",
    uiBackground: "240 21.3% 12%",
    uiSurface: "240deg 21% 15%",
    uiSurfaceHover: "237deg 16% 23%",
    uiBorder: "230.3 12.4% 49.2%",
    uiText: "227.4 68.3% 87.6%",
    uiTextSecondary: "228 39.2% 80%",
    uiTextMuted: "227.4 26.8% 72.2%",
    uiAccent: "266.5 82.7% 79.6%",
    uiAccentHover: "266.5 82.7% 79.6%",
    hightlightColor: {
      yellow: "rgb(238, 212, 159)",
      red: "rgb(238, 153, 160)",
      green: "rgb(166, 218, 149)",
      blue: "rgb(125, 196, 228)",
      magenta: "rgb(245, 189, 230)",
    },
  },
} satisfies Record<
  ReadingTheme,
  Pick<EpubPreferences, "backgroundColor" | "textColor"> & {
    uiBackground: string
    uiSurface: string
    uiSurfaceHover: string
    uiBorder: string
    uiText: string
    uiTextSecondary: string
    uiTextMuted: string
    uiAccent: string
    uiAccentHover: string
    hightlightColor: {
      yellow: string
      red: string
      green: string
      blue: string
      magenta: string
    }
  }
>

export const getTheme = (preferences: ReadingPreferences) => {
  return themes[preferences.theme]
}

export const getLetterSpacing = (preferences: ReadingPreferences): number => {
  return preferences.spacing === "default"
    ? 0
    : preferences.spacing === "tight"
      ? -0.05
      : preferences.spacing === "balanced"
        ? 0.05
        : 0.1
}

const getFontFamily = (
  preferences: ReadingPreferences,
  fontFamily: FontFamily,
) => {
  const fontFamilyMap = {
    publisher: null,
    Literata: "Literata",
    OpenDyslexic: "OpenDyslexic",
    serif: "serif",
    "sans-serif": "sans-serif",
    monospace: "monospace",
    custom: preferences.customFontFamily.name,
  } satisfies Record<FontFamily, string | null>
  return fontFamilyMap[fontFamily]
}

export const readiumIfyPreferences = (
  preferences: ReadingPreferences,
): EpubPreferences => {
  const theme = getTheme(preferences)
  return {
    backgroundColor: `hsl(${theme.backgroundColor})`,
    textColor: `hsl(${theme.textColor})`,
    textAlign: preferences.align,
    fontSize: preferences.fontSize / 100,
    /**
     * the amount of time i could have saves if i knew to set this setting!!!!!
     * for some reason we need this otherwise safari is not able to find the correct page if fontsize is not 100%
     */
    deprecatedFontSize: typeof window !== "undefined" && isSafari(window),
    fontWeight: preferences.fontWeight,
    columnCount: preferences.columns || null,
    letterSpacing: getLetterSpacing(preferences),
    lineHeight: preferences.lineHeight,
    paragraphSpacing: preferences.paragraphSpacing,
    scroll: preferences.layout === "scrollable",
    scrollPaddingBottom: 100,
    scrollPaddingTop: 100,
    maximalLineLength: preferences.lineLength + 10,
    minimalLineLength: preferences.lineLength - 10,
    optimalLineLength: preferences.lineLength,
    hyphens: true,
    fontFamily: getFontFamily(preferences, preferences.fontFamily),
    merging: (other) => ({ ...other }),
  }
}

export const applyThemeToDocument = (
  preferences: ReadingPreferences,
  document = typeof window !== "undefined" ? window.document : null,
) => {
  if (!document) return

  const uiTheme = getTheme(preferences)
  const root = document.head

  const styleProperties = [
    ["--reader-ui-bg", uiTheme.uiBackground],
    ["--reader-ui-surface", uiTheme.uiSurface],
    ["--reader-ui-surface-hover", uiTheme.uiSurfaceHover],
    ["--reader-ui-border", uiTheme.uiBorder],
    ["--reader-ui-text", uiTheme.uiText],
    ["--reader-ui-text-secondary", uiTheme.uiTextSecondary],
    ["--reader-ui-text-muted", uiTheme.uiTextMuted],
    ["--reader-ui-accent", uiTheme.uiAccent],
    ["--reader-ui-accent-hover", uiTheme.uiAccentHover],
    ["--reader-highlight-color-yellow", uiTheme.hightlightColor.yellow],
    ["--reader-highlight-color-red", uiTheme.hightlightColor.red],
    ["--reader-highlight-color-green", uiTheme.hightlightColor.green],
    ["--reader-highlight-color-blue", uiTheme.hightlightColor.blue],
    ["--reader-highlight-color-magenta", uiTheme.hightlightColor.magenta],
    ["--reader-highlight-color-custom", preferences.customHighlightColor],
    [
      "--reader-highlight-color",
      preferences.highlightColor === "custom"
        ? preferences.customHighlightColor
        : uiTheme.hightlightColor[preferences.highlightColor],
    ],
    ...(preferences.fontFamily !== "publisher"
      ? [["--reader-font-family", preferences.fontFamily]]
      : []),
  ]
    .map((style) => style.join(": "))
    .join(";")

  const styles = [
    `:root {${styleProperties}}`,

    `.reader-fragment {
      cursor: pointer;
    }`,

    // v necessary on eg safari iOS, otherwise weird blank bars
    `body { background-color: hsl(${uiTheme.backgroundColor}); }`,
  ]

  if (preferences.fontFamily === "Literata") {
    styles.push(`@font-face {
    font-family: "Literata";
    font-weight: ${preferences.fontWeight};
    font-optical-sizing: auto;
    src: url("/fonts/Literata.ttf") format("truetype"), url("/fonts/Literata-Italic.ttf") format("truetype");
}`)
  }
  if (preferences.fontFamily === "OpenDyslexic") {
    styles.push(`@font-face {
    font-family: "OpenDyslexic";
    font-weight: ${preferences.fontWeight};
    font-optical-sizing: auto;
    src: url("/fonts/OpenDyslexic-Regular.woff2") format("woff2"),
        url("/fonts/OpenDyslexic-Bold.woff2") format("woff2"),
        url("/fonts/OpenDyslexic-Italic.woff2") format("woff2"),
        url("/fonts/OpenDyslexic-Bold-Italic.woff2") format("woff2");
}`)
  }

  if (preferences.fontFamily === "custom" && preferences.customFontFamily.url) {
    let link1 = document.getElementById(
      "reader-font-preconnect-1",
    ) as HTMLLinkElement | null
    if (!link1) {
      link1 = document.createElement("link")
      root.appendChild(link1)
    }

    if (link1.href !== "https://fonts.googleapis.com") {
      link1.id = "reader-font-preconnect-1"
      link1.rel = "preconnect"
      link1.href = "https://fonts.googleapis.com"
    }

    let link2 = document.getElementById(
      "reader-font-preconnect-2",
    ) as HTMLLinkElement | null
    if (!link2) {
      link2 = document.createElement("link")
      root.appendChild(link2)
    }
    if (link2.href !== "https://fonts.gstatic.com") {
      link2.rel = "preconnect"
      link2.href = "https://fonts.gstatic.com"
      link2.crossOrigin = "anonymous"
    }

    let link3 = document.getElementById(
      "reader-google-font-link",
    ) as HTMLLinkElement | null
    if (!link3) {
      link3 = document.createElement("link")
      root.appendChild(link3)
    }
    if (link3.href !== preferences.customFontFamily.url) {
      link3.id = "reader-google-font-link"
      link3.rel = "stylesheet"
      link3.href = preferences.customFontFamily.url
    }
  }

  const readerStylesElement =
    document.getElementById("reader-styles") || document.createElement("style")
  readerStylesElement.id = "reader-styles"

  const themeColorMetaElement =
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]') ||
    document.createElement("meta")
  themeColorMetaElement.name = "theme-color"
  themeColorMetaElement.content = `hsl(${uiTheme.backgroundColor})`

  const stylesString = styles.join("\n")

  if (readerStylesElement.textContent === stylesString) return

  readerStylesElement.textContent = stylesString
  root.appendChild(readerStylesElement)
  root.appendChild(themeColorMetaElement)
}

export const removeThemeFromDocument = (
  document = typeof window !== "undefined" ? window.document : null,
) => {
  if (!document) return

  const readerStylesElement = document.getElementById("reader-styles")
  if (readerStylesElement) {
    readerStylesElement.remove()
  }
  const themeColorMetaElement = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  )
  if (themeColorMetaElement) {
    themeColorMetaElement.remove()
  }
}

const STORAGE_KEY = "reader-preferences"

export const storePreferencesInStorage = (preferences: {
  global: ReadingPreferences
  perBook: Record<UUID, Partial<ReadingPreferences>>
}) => {
  if (typeof window === "undefined") return

  localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences.global))

  for (const bookId in preferences.perBook) {
    localStorage.setItem(
      `${STORAGE_KEY}-${bookId}`,
      JSON.stringify(preferences.perBook[bookId as UUID]),
    )
  }
}

// this should be called once when the store is created
export const loadGlobalPreferencesFromStorage =
  (): Partial<ReadingPreferences> | null => {
    if (typeof window === "undefined") return null

    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) return null
      return JSON.parse(stored) as Partial<ReadingPreferences>
    } catch (error) {
      console.error("failed to load preferences from localStorage:", error)
      return null
    }
  }

export const loadPerBookPreferencesFromStorage = (
  bookId: UUID,
): Partial<ReadingPreferences> | null => {
  if (typeof window === "undefined") return null
  const stored = localStorage.getItem(`${STORAGE_KEY}-${bookId}`)
  if (!stored) return null
  return JSON.parse(stored) as Partial<ReadingPreferences>
}

/**
 * this is to get the initial theme applied to the document before flashing unstyled content
 */
export const getInitialHydratedPreferences = (
  target: "global" | UUID,
): ReadingPreferences => {
  const globalPreferences = loadGlobalPreferencesFromStorage()

  if (target === "global") {
    return { ...defaultPreferences, ...globalPreferences }
  }

  const bookPreferences = loadPerBookPreferencesFromStorage(target)

  return { ...defaultPreferences, ...globalPreferences, ...bookPreferences }
}
