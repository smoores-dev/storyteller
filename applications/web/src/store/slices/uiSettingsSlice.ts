import { type PayloadAction, createSlice } from "@reduxjs/toolkit"

import { type GridCardSize } from "@/database/userPreferencesTypes"
import { type BookSort, type DisplayField } from "@/sort"

export type BookLayout = "grid" | "list"
export type BookView = BookLayout

export type GridView = "card" | "thumbnail"
export type ListView = "list" | "table"

export type GridSpacing = "compact" | "cozy" | "spacious"

export type LogDisplayPrefs = {
  wrapLines: boolean
  highlighting: boolean
  followMode: boolean
  hideTime: boolean
  lineCount: number
  levelFilter: string
}

export type UISettings = {
  detailPanelWidth: number
  librarySidebarWidth: number
  bookLayout: BookLayout

  alwaysLoadAllBooks: boolean

  defaultSorts: Record<string, BookSort[number]>

  gridView: GridView
  listView: ListView
  gridDisplayFields: DisplayField[] | null
  gridSpacing: GridSpacing
  gridCardSize: GridCardSize
  listDisplayFields: DisplayField[]
  listShowThumbnail: boolean
  tableColumnOrder: string[] | null
  tableColumnWidths: Record<string, number>
  showReadaloudBadge: boolean
  showProcessingBadge: boolean
  showMissingBadge: boolean
  logDisplay: LogDisplayPrefs
  collapsedSidebarGroups: Record<string, boolean>
  collapsedDetailSections: Record<string, boolean>
  detailSectionOrder: string[] | null
  hiddenDetailSections: string[]
  detailCoverWidth: number | null

  processingToastLocation: "bottom-right" | "sidebar"

  theme: "light" | "dark" | "system"
}

const COOKIE_NAME = "st-ui"
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

const defaultLogDisplay: LogDisplayPrefs = {
  wrapLines: false,
  highlighting: true,
  followMode: true,
  hideTime: false,
  lineCount: 500,
  levelFilter: "all",
}

const defaultListDisplayFields: DisplayField[] = [
  "authors",
  "duration",
  "pageCount",
]

const defaults: UISettings = {
  detailPanelWidth: 420,
  librarySidebarWidth: 280,
  bookLayout: "grid",
  alwaysLoadAllBooks: false,
  gridView: "card",
  listView: "list",
  gridDisplayFields: null,
  gridSpacing: "cozy",
  gridCardSize: "medium",
  listDisplayFields: defaultListDisplayFields,
  listShowThumbnail: true,
  tableColumnOrder: null,
  tableColumnWidths: {},
  showReadaloudBadge: true,
  showProcessingBadge: true,
  showMissingBadge: true,
  logDisplay: defaultLogDisplay,
  collapsedSidebarGroups: {},
  collapsedDetailSections: {},
  detailSectionOrder: null,
  hiddenDetailSections: [],
  detailCoverWidth: null,
  theme: "system",
  defaultSorts: {},
  processingToastLocation: "bottom-right",
}

export { defaults as UI_SETTINGS_DEFAULTS }

export function parseCookie(cookieString: string): Partial<UISettings> | null {
  try {
    const match = cookieString
      .split("; ")
      .find((row) => row.startsWith(`${COOKIE_NAME}=`))

    if (!match) return null

    const value = decodeURIComponent(match.split("=")[1] ?? "")
    return JSON.parse(value) as Partial<UISettings>
  } catch {
    return null
  }
}

export const loadUISettingsFromCookie = (): Partial<UISettings> | null => {
  if (typeof document === "undefined") return null
  return parseCookie(document.cookie)
}

function saveToCookie(settings: UISettings): void {
  if (typeof document === "undefined") return

  try {
    const value = JSON.stringify(settings)
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`
  } catch {}
}

export { COOKIE_NAME as UI_SETTINGS_COOKIE_NAME }

export const uiSettingsSlice = createSlice({
  name: "uiSettings",
  initialState: defaults,

  reducers: {
    initUISettings: (state, action: PayloadAction<Partial<UISettings>>) => {
      const merged = { ...defaults, ...state, ...action.payload }

      merged.logDisplay = {
        ...defaultLogDisplay,
        ...merged.logDisplay,
      }

      const legacy = action.payload as Record<string, unknown>
      if (
        !("bookLayout" in legacy) &&
        (legacy["bookView"] === "grid" || legacy["bookView"] === "list")
      ) {
        merged.bookLayout = legacy["bookView"]
      }
      if (
        !merged.listDisplayFields.length &&
        Array.isArray(legacy["listVisibleColumns"])
      ) {
        merged.listDisplayFields = legacy[
          "listVisibleColumns"
        ] as DisplayField[]
      }
      if (
        !merged.listDisplayFields.length &&
        Array.isArray(legacy["listVisibleFields"])
      ) {
        merged.listDisplayFields = legacy["listVisibleFields"] as DisplayField[]
      }

      if (merged.listDisplayFields.length === 0) {
        merged.listDisplayFields = defaultListDisplayFields
      }

      return merged
    },

    setDetailPanelWidth: (state, action: PayloadAction<number>) => {
      state.detailPanelWidth = action.payload
      saveToCookie(state)
    },

    setLibrarySidebarWidth: (state, action: PayloadAction<number>) => {
      state.librarySidebarWidth = action.payload
      saveToCookie(state)
    },

    setAlwaysLoadAllBooks: (state, action: PayloadAction<boolean>) => {
      state.alwaysLoadAllBooks = action.payload
      saveToCookie(state)
    },

    setBookLayout: (state, action: PayloadAction<BookLayout>) => {
      state.bookLayout = action.payload
      saveToCookie(state)
    },

    setGridView: (state, action: PayloadAction<GridView>) => {
      state.gridView = action.payload
      saveToCookie(state)
    },

    setListView: (state, action: PayloadAction<ListView>) => {
      state.listView = action.payload
      saveToCookie(state)
    },

    setListDisplayFields: (state, action: PayloadAction<DisplayField[]>) => {
      state.listDisplayFields = action.payload
      saveToCookie(state)
    },

    setListShowThumbnail: (state, action: PayloadAction<boolean>) => {
      state.listShowThumbnail = action.payload
      saveToCookie(state)
    },

    setTableColumnOrder: (state, action: PayloadAction<string[] | null>) => {
      state.tableColumnOrder = action.payload
      saveToCookie(state)
    },

    setTableColumnWidths: (
      state,
      action: PayloadAction<Record<string, number>>,
    ) => {
      state.tableColumnWidths = {
        ...state.tableColumnWidths,
        ...action.payload,
      }
      saveToCookie(state)
    },

    resetTableColumnWidth: (state, action: PayloadAction<string>) => {
      state.tableColumnWidths = Object.fromEntries(
        Object.entries(state.tableColumnWidths).filter(
          ([key]) => key !== action.payload,
        ),
      )
      saveToCookie(state)
    },

    setGridDisplayFields: (
      state,
      action: PayloadAction<DisplayField[] | null>,
    ) => {
      state.gridDisplayFields = action.payload
      saveToCookie(state)
    },

    setGridSpacing: (state, action: PayloadAction<GridSpacing>) => {
      state.gridSpacing = action.payload
      saveToCookie(state)
    },

    setGridCardSize: (state, action: PayloadAction<GridCardSize>) => {
      state.gridCardSize = action.payload
      saveToCookie(state)
    },

    setShowReadaloudBadge: (state, action: PayloadAction<boolean>) => {
      state.showReadaloudBadge = action.payload
      saveToCookie(state)
    },

    setShowProcessingBadge: (state, action: PayloadAction<boolean>) => {
      state.showProcessingBadge = action.payload
      saveToCookie(state)
    },

    setShowMissingBadge: (state, action: PayloadAction<boolean>) => {
      state.showMissingBadge = action.payload
      saveToCookie(state)
    },

    setTheme: (state, action: PayloadAction<"light" | "dark" | "system">) => {
      state.theme = action.payload
      saveToCookie(state)
    },

    setLogDisplayPrefs: (
      state,
      action: PayloadAction<Partial<LogDisplayPrefs>>,
    ) => {
      state.logDisplay = { ...state.logDisplay, ...action.payload }
      saveToCookie(state)
    },

    toggleSidebarGroupCollapsed: (
      state,
      action: PayloadAction<{ groupId: string; collapsed: boolean }>,
    ) => {
      state.collapsedSidebarGroups[action.payload.groupId] =
        action.payload.collapsed

      saveToCookie(state)
    },

    toggleDetailSection: (
      state,
      action: PayloadAction<{ sectionKey: string; collapsed: boolean }>,
    ) => {
      state.collapsedDetailSections[action.payload.sectionKey] =
        action.payload.collapsed

      saveToCookie(state)
    },

    setDetailSections: (
      state,
      action: PayloadAction<{ order: string[] | null; hidden: string[] }>,
    ) => {
      state.detailSectionOrder = action.payload.order
      state.hiddenDetailSections = action.payload.hidden

      saveToCookie(state)
    },

    setDetailCoverWidth: (state, action: PayloadAction<number | null>) => {
      state.detailCoverWidth = action.payload

      saveToCookie(state)
    },

    setDefaultSort: (
      state,
      action: PayloadAction<{ page: string; sort: BookSort[number] }>,
    ) => {
      state.defaultSorts[action.payload.page] = action.payload.sort
      saveToCookie(state)
    },

    clearDefaultSort: (state, action: PayloadAction<{ page: string }>) => {
      state.defaultSorts = Object.fromEntries(
        Object.entries(state.defaultSorts).filter(
          ([page]) => page !== action.payload.page,
        ),
      )
      saveToCookie(state)
    },

    setProcessingToastLocation: (
      state,
      action: PayloadAction<"bottom-right" | "sidebar">,
    ) => {
      state.processingToastLocation = action.payload
      saveToCookie(state)
    },
  },
})

export const uiSettingsReducer = uiSettingsSlice.reducer

export const selectBookLayout = (state: { uiSettings: UISettings }) =>
  state.uiSettings.bookLayout

export const selectAlwaysLoadAllBooks = (state: { uiSettings: UISettings }) =>
  state.uiSettings.alwaysLoadAllBooks

export const selectGridView = (state: { uiSettings: UISettings }) =>
  state.uiSettings.gridView

export const selectListView = (state: { uiSettings: UISettings }) =>
  state.uiSettings.listView

export const selectListDisplayFields = (state: { uiSettings: UISettings }) =>
  state.uiSettings.listDisplayFields

export const selectListShowThumbnail = (state: { uiSettings: UISettings }) =>
  state.uiSettings.listShowThumbnail

export const selectTableColumnOrder = (state: { uiSettings: UISettings }) =>
  state.uiSettings.tableColumnOrder

export const selectTableColumnWidths = (state: { uiSettings: UISettings }) =>
  state.uiSettings.tableColumnWidths

export const selectGridDisplayFields = (state: { uiSettings: UISettings }) =>
  state.uiSettings.gridDisplayFields

export const selectGridSpacing = (state: { uiSettings: UISettings }) =>
  state.uiSettings.gridSpacing

export const selectGridCardSize = (state: { uiSettings: UISettings }) =>
  state.uiSettings.gridCardSize

export const selectShowReadaloudBadge = (state: { uiSettings: UISettings }) =>
  state.uiSettings.showReadaloudBadge

export const selectShowProcessingBadge = (state: { uiSettings: UISettings }) =>
  state.uiSettings.showProcessingBadge

export const selectShowMissingBadge = (state: { uiSettings: UISettings }) =>
  state.uiSettings.showMissingBadge

export const selectLogDisplayPrefs = (state: { uiSettings: UISettings }) =>
  state.uiSettings.logDisplay

export const selectCollapsedSidebarGroups = (state: {
  uiSettings: UISettings
}) => state.uiSettings.collapsedSidebarGroups

export const selectCollapsedDetailSections = (state: {
  uiSettings: UISettings
}) => state.uiSettings.collapsedDetailSections

export const selectDetailSectionOrder = (state: { uiSettings: UISettings }) =>
  state.uiSettings.detailSectionOrder

export const selectHiddenDetailSections = (state: { uiSettings: UISettings }) =>
  state.uiSettings.hiddenDetailSections

export const selectDetailCoverWidth = (state: { uiSettings: UISettings }) =>
  state.uiSettings.detailCoverWidth

export const selectTheme = (state: { uiSettings: UISettings }) =>
  state.uiSettings.theme

export const selectDefaultSorts = (state: { uiSettings: UISettings }) => {
  return state.uiSettings.defaultSorts
}

export const selectProcessingToastLocation = (state: {
  uiSettings: UISettings
}) => state.uiSettings.processingToastLocation
