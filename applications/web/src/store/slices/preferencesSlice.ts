import { type IEpubPreferences, type TextAlignment } from "@readium/navigator"
import {
  type PayloadAction,
  createSelector,
  createSlice,
} from "@reduxjs/toolkit"

import { bookCoverSwatches } from "@v3/_/components/books/coverSwatches"

import { isSafari } from "@/components/reader/helpers"
import { type BookWithRelations } from "@/database/books"
import { type RootState } from "@/store/appState"
import { type UUID } from "@/uuid"

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
  | "light"
  | "paper"
  | "sepia"
  | "cover-light"
  | "dark"
  | "catppuccin"
  | "cover-dark"

export type ReadingThemeScheme = "light" | "dark"

export const READER_THEMES: {
  id: ReadingTheme
  label: string
  scheme: ReadingThemeScheme
}[] = [
  { id: "light", label: "Light", scheme: "light" },
  { id: "paper", label: "Paper", scheme: "light" },
  { id: "sepia", label: "Sepia", scheme: "light" },
  { id: "cover-light", label: "Cover", scheme: "light" },
  { id: "dark", label: "Dark", scheme: "dark" },
  { id: "catppuccin", label: "Catppuccin", scheme: "dark" },
  { id: "cover-dark", label: "Cover", scheme: "dark" },
]

export type HighlightColor =
  // | "yellow"
  // | "red"
  // | "green"
  // | "blue"
  // | "magenta"
  "cover" | "custom"

export type HighlightStyle =
  | "highlight"
  | "highlightUnderline"
  | "underline"
  | "textColor"

export type MiniPlayerCorner =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"

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
  highlightColor: HighlightColor
  highlightStyle: HighlightStyle
  dimWhilePlaying: boolean
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
  miniPlayerCorner: MiniPlayerCorner
  customFontFamily: {
    url: string
    name: string
  }
  volume: number
  scrollBehavior: "smooth" | "instant"
  smoothScrollImplementation: "native" | "custom"
  smoothScrollSpeed: number

  // display
  footerDisplayWidth: "full" | "minimal" | "text"

  // behavior
  skipOnTurnPage: boolean
  openPipOnTabOut: boolean
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
  "miniPlayerCorner",
  "annotationPanel",
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
  fontFamily: "Literata",
  theme: "cover-light",
  align: "justify" as TextAlignment,
  spacing: "default",
  layout: "paginated",
  columns: 0, // 0 means auto
  playbackSpeed: 1.0,
  lineHeight: 1.4,
  paragraphSpacing: 0,
  lineLength: 45,
  paragraphIndent: 0,
  hyphens: true,
  highlightColor: "cover",
  highlightStyle: "textColor",
  dimWhilePlaying: true,
  detailView: {
    mode: "audio",
    scope: "chapter",
  },
  customHighlightColor: "oklch(0.9 0.08 200 / 0.9)",
  syncOffset: 0.0,
  neverShowMiniPlayer: false,
  minimizedMiniPlayer: false,
  pinnedMiniPlayer: false,
  miniPlayerPosition: null,
  miniPlayerCorner: "bottom-right",
  volume: 100,
  fontWeight: 400,
  customFontFamily: {
    url: "https://fonts.googleapis.com/css2?family=Crimson+Text:ital,wght@0,400;0,600;0,700;1,400;1,600;1,700&display=swap",
    name: "Crimson Text",
  },
  scrollBehavior: "smooth",
  smoothScrollImplementation: "custom",
  smoothScrollSpeed: 1.0,

  // display
  footerDisplayWidth: "full",

  // behavior
  skipOnTurnPage: true,
  openPipOnTabOut: true,
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

    applyBookPreferencesToAllBooks: (
      state,
      action: PayloadAction<{ bookId: UUID }>,
    ) => {
      state.global = {
        ...state.global,
        ...state.perBook[action.payload.bookId],
      }
      state.perBook = {}
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
          : (state.perBook[target]?.playbackSpeed ?? state.global.playbackSpeed)
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
          : (state.perBook[target]?.detailView ?? {
              mode: "text",
              scope: "chapter",
            })

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
  tokens: ReaderTokens,
): IEpubPreferences => {
  return {
    backgroundColor: tokens.bg,
    textColor: tokens.text,
    linkColor: tokens.accent,
    selectionBackgroundColor: tokens.selectionBg,
    selectionTextColor: tokens.selectionText,
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
    scrollPaddingLeft: 10,
    scrollPaddingRight: 10,
    maximalLineLength: preferences.lineLength + 10,
    minimalLineLength: preferences.lineLength - 10,
    optimalLineLength: preferences.lineLength,
    hyphens: true,
    fontFamily: getFontFamily(preferences, preferences.fontFamily),
  }
}

export type ReaderTokens = {
  scheme: ReadingThemeScheme
  bg: string
  text: string
  accent: string
  selectionBg: string
  selectionText: string
  highlight: string
  highlightMid: string
  highlightStrong: string
}

const FALLBACK_TOKENS: ReaderTokens = {
  scheme: "light",
  bg: "#ffffff",
  text: "#000000",
  accent: "#e8651a",
  selectionBg: "#e8651a",
  selectionText: "#ffffff",
  highlight: "#f3e08a",
  highlightMid: "#b28b1f",
  highlightStrong: "#6d5510",
}

export const readerCoverColor = (book: BookWithRelations | null) => {
  if (!book) return null
  const swatches = bookCoverSwatches(book)
  return swatches.hasColors ? swatches.primary.css : null
}

export const readReaderTokens = (
  target = typeof window !== "undefined" ? window.document : null,
): ReaderTokens => {
  const view = target?.defaultView
  if (!view) return FALLBACK_TOKENS

  const styles = view.getComputedStyle(target.documentElement)
  const read = (name: string) =>
    styles.getPropertyValue(`--reader-${name}`).trim()

  return {
    scheme: read("scheme") === "dark" ? "dark" : "light",
    bg: read("bg") || FALLBACK_TOKENS.bg,
    text: read("text") || FALLBACK_TOKENS.text,
    accent: read("accent") || FALLBACK_TOKENS.accent,
    selectionBg: read("selection-bg") || FALLBACK_TOKENS.selectionBg,
    selectionText: read("selection-text") || FALLBACK_TOKENS.selectionText,
    highlight: read("highlight") || FALLBACK_TOKENS.highlight,
    highlightMid: read("highlight-mid") || FALLBACK_TOKENS.highlightMid,
    highlightStrong:
      read("highlight-strong") || FALLBACK_TOKENS.highlightStrong,
  }
}

export const highlightTint = (tokens: ReaderTokens, style: HighlightStyle) => {
  switch (style) {
    case "highlight":
      return tokens.highlight
    case "highlightUnderline":
      return tokens.highlightMid
    default:
      return tokens.highlightStrong
  }
}

export const applyReaderTheme = (
  preferences: ReadingPreferences,
  book: BookWithRelations | null,
  target = typeof window !== "undefined" ? window.document : null,
) => {
  if (!target) {
    return
  }

  const root = target.documentElement
  root.dataset["readerTheme"] = preferences.theme
  root.dataset["readerHighlight"] = preferences.highlightColor
  root.style.setProperty(
    "--reader-highlight-custom",
    preferences.customHighlightColor,
  )

  const coverColor = readerCoverColor(book)
  if (coverColor) {
    root.style.setProperty("--cover-1", coverColor)
  } else {
    root.style.removeProperty("--cover-1")
  }

  const meta =
    target.querySelector<HTMLMetaElement>('meta[name="theme-color"]') ??
    target.head.appendChild(target.createElement("meta"))
  meta.name = "theme-color"
  meta.content = readReaderTokens(target).bg
}

export const removeReaderTheme = (
  target = typeof window !== "undefined" ? window.document : null,
) => {
  if (!target) {
    return
  }

  const root = target.documentElement
  delete root.dataset["readerTheme"]
  delete root.dataset["readerHighlight"]
  root.style.removeProperty("--cover-1")
  root.style.removeProperty("--reader-highlight-custom")
  target.querySelector('meta[name="theme-color"]')?.remove()
  target.getElementById("reader-styles")?.remove()
}

const fontFaces = (preferences: ReadingPreferences) => {
  if (preferences.fontFamily === "Literata") {
    return [
      `@font-face { font-family: "Literata"; font-style: normal; font-weight: 200 900; font-display: swap; src: url("/fonts/Literata.woff2") format("woff2"); }`,
      `@font-face { font-family: "Literata"; font-style: italic; font-weight: 200 900; font-display: swap; src: url("/fonts/Literata-Italic.woff2") format("woff2"); }`,
    ]
  }

  if (preferences.fontFamily === "OpenDyslexic") {
    return [
      `@font-face { font-family: "OpenDyslexic"; font-style: normal; font-weight: 400; font-display: swap; src: url("/fonts/OpenDyslexic-Regular.woff2") format("woff2"); }`,
      `@font-face { font-family: "OpenDyslexic"; font-style: normal; font-weight: 700; font-display: swap; src: url("/fonts/OpenDyslexic-Bold.woff2") format("woff2"); }`,
      `@font-face { font-family: "OpenDyslexic"; font-style: italic; font-weight: 400; font-display: swap; src: url("/fonts/OpenDyslexic-Italic.woff2") format("woff2"); }`,
      `@font-face { font-family: "OpenDyslexic"; font-style: italic; font-weight: 700; font-display: swap; src: url("/fonts/OpenDyslexic-Bold-Italic.woff2") format("woff2"); }`,
    ]
  }

  return []
}

const ensureLink = (
  target: Document,
  id: string,
  apply: (link: HTMLLinkElement) => void,
) => {
  const existing = target.getElementById(id) as HTMLLinkElement | null
  if (existing) {
    apply(existing)
    return
  }

  const link = target.createElement("link")
  link.id = id
  apply(link)
  target.head.appendChild(link)
}

const FRAME_DIM_ATTRIBUTE = "data-reader-dim"

export const applyFrameDim = (
  frameDocument: Document | null | undefined,
  dim: boolean,
) => {
  if (!frameDocument) return

  if (dim) {
    frameDocument.documentElement.setAttribute(FRAME_DIM_ATTRIBUTE, "")
  } else {
    frameDocument.documentElement.removeAttribute(FRAME_DIM_ATTRIBUTE)
  }
}

export const applyFrameTheme = (
  preferences: ReadingPreferences,
  tokens: ReaderTokens,
  frameDocument: Document | null | undefined,
) => {
  if (!frameDocument) return

  frameDocument.documentElement.dataset["readerScheme"] = tokens.scheme

  if (preferences.fontFamily === "custom" && preferences.customFontFamily.url) {
    ensureLink(frameDocument, "reader-font-preconnect-1", (link) => {
      link.rel = "preconnect"
      link.href = "https://fonts.googleapis.com"
    })
    ensureLink(frameDocument, "reader-font-preconnect-2", (link) => {
      link.rel = "preconnect"
      link.href = "https://fonts.gstatic.com"
      link.crossOrigin = "anonymous"
    })
    ensureLink(frameDocument, "reader-google-font-link", (link) => {
      link.rel = "stylesheet"
      if (link.href !== preferences.customFontFamily.url) {
        link.href = preferences.customFontFamily.url
      }
    })
  }

  const css = [
    `::selection { background-color: ${tokens.selectionBg}; color: ${tokens.selectionText}; }`,
    `body { background-color: ${tokens.bg}; }`,
    `:root[${FRAME_DIM_ATTRIBUTE}][${FRAME_DIM_ATTRIBUTE}] { color: color-mix(in oklab, ${tokens.text} 40%, ${tokens.bg}) !important; }`,
    ...fontFaces(preferences),
  ].join("\n")

  const existing = frameDocument.getElementById(
    "reader-styles",
  ) as HTMLStyleElement | null
  if (existing) {
    if (existing.textContent !== css) existing.textContent = css
    return
  }

  const style = frameDocument.createElement("style")
  style.id = "reader-styles"
  style.textContent = css
  frameDocument.head.appendChild(style)
}

const STORAGE_KEY = "reader-preferences"

const LEGACY_THEMES: Record<string, ReadingTheme> = {
  cattpuccin: "catppuccin",
}

const normalizeStoredPreferences = (
  stored: Partial<ReadingPreferences>,
): Partial<ReadingPreferences> => {
  const theme = stored.theme as string | undefined
  if (!theme) return stored

  if (theme === "auto") {
    const dark =
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark")
    return { ...stored, theme: dark ? "dark" : "light" }
  }

  const migrated = LEGACY_THEMES[theme]
  if (migrated) return { ...stored, theme: migrated }

  return stored
}

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

export const clearPerBookPreferencesInStorage = () => {
  if (typeof window === "undefined") return

  Object.keys(localStorage)
    .filter((key) => key.startsWith(`${STORAGE_KEY}-`))
    .forEach((key) => {
      localStorage.removeItem(key)
    })
}

// this should be called once when the store is created
export const loadGlobalPreferencesFromStorage =
  (): Partial<ReadingPreferences> | null => {
    if (typeof window === "undefined") return null

    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) return null
      return normalizeStoredPreferences(
        JSON.parse(stored) as Partial<ReadingPreferences>,
      )
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
  return normalizeStoredPreferences(
    JSON.parse(stored) as Partial<ReadingPreferences>,
  )
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
