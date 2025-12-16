import type { FrameManager } from "@readium/navigator"
import type { Locator } from "@readium/shared"
import {
  type PayloadAction,
  createSelector,
  createSlice,
} from "@reduxjs/toolkit"

import { isSameLocator } from "@/components/reader/locators"
import type { BookWithRelations } from "@/database/books"
import type { RootState } from "@/store/appState"
import {
  getPublication,
  getTocItems,
  registerActiveFrame,
} from "@/store/readerRegistry"

export type ReadingMode = "epub" | "audiobook" | "readaloud"

export type ReaderErrorType =
  | "book_not_found"
  | "resource_not_found"
  | "service_unavailable"
  | "internal_error"
  | null

type ReadingSessionState = {
  currentbook: BookWithRelations | null

  isLoadingPublication: boolean

  currentLocator: Locator | null

  mode: ReadingMode

  syncing: boolean

  lastPositionUpdate: number | null
  currentlyHighlightedFragment: string | null
  currentSyncTimeout: number | null
  activeFrameUrl: string | null

  doubleClickTimeout: number | null
  sleepTimer: number | null

  error: ReaderErrorType
  errorMessage: string | null
}

const initialState: ReadingSessionState = {
  currentbook: null,
  isLoadingPublication: false,
  currentLocator: null,
  mode: "readaloud",
  syncing: false,
  lastPositionUpdate: null,
  currentlyHighlightedFragment: null,
  currentSyncTimeout: null,
  activeFrameUrl: null,
  doubleClickTimeout: null,
  sleepTimer: null,
  error: null,
  errorMessage: null,
}

export const readingSessionSlice = createSlice({
  name: "readingSession",
  initialState,

  reducers: {
    startBook: (
      state,
      action: PayloadAction<{
        book: BookWithRelations
        requestedMode?: ReadingMode | undefined
      }>,
    ) => {
      state.currentbook = action.payload.book
      state.isLoadingPublication = true
      state.error = null
      state.errorMessage = null

      const availableModes = getAvailableMode(action.payload.book)

      if (!action.payload.requestedMode) {
        state.mode = availableModes[0] as ReadingMode
      } else if (!availableModes.includes(action.payload.requestedMode)) {
        state.mode = availableModes[0] as ReadingMode
      } else {
        state.mode = action.payload.requestedMode
      }

      state.syncing = state.mode === "readaloud"
    },

    setPublicationLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoadingPublication = action.payload
    },

    setReaderError: (
      state,
      action: PayloadAction<{ error: ReaderErrorType; message: string }>,
    ) => {
      state.error = action.payload.error
      state.errorMessage = action.payload.message
      state.isLoadingPublication = false
    },

    clearReaderError: (state) => {
      state.error = null
      state.errorMessage = null
    },

    setActiveFrame: (state, action: PayloadAction<FrameManager | null>) => {
      state.activeFrameUrl = action.payload?.iframe.src ?? null
      registerActiveFrame(action.payload)
    },

    sleepTimerSet: (
      state,
      action: PayloadAction<{ sleepTimer: Date | null }>,
    ) => {
      state.sleepTimer = action.payload.sleepTimer?.getTime() ?? null
    },
    sleepTimerExpired: (state) => {
      state.sleepTimer = null
    },

    updateLocator: (
      state,
      action: PayloadAction<{
        locator: Locator
        timestamp?: number
      }>,
    ) => {
      if (
        state.currentLocator &&
        isSameLocator(state.currentLocator, action.payload.locator)
      ) {
        return
      }

      state.currentLocator = action.payload.locator
      state.lastPositionUpdate = action.payload.timestamp ?? Date.now()
    },

    setCurrentSyncTimeout: (state, action: PayloadAction<number | null>) => {
      state.currentSyncTimeout = action.payload
    },

    // update currently highlighted fragment
    updateCurrentlyHighlightedFragment: (
      state,
      action: PayloadAction<
        (Locator & { locations: { fragments: string[] } }) | null
      >,
    ) => {
      state.currentlyHighlightedFragment =
        action.payload?.locations.fragments[0] ?? null
    },

    setMode: (state, action: PayloadAction<ReadingMode>) => {
      state.mode = action.payload
    },

    setSyncing: (state, action: PayloadAction<boolean>) => {
      state.syncing = action.payload
    },

    setDoubleClickTimeout: (state, action: PayloadAction<number | null>) => {
      state.doubleClickTimeout = action.payload
    },

    closeBook: (state) => {
      state.currentbook = null
      state.currentLocator = null
      state.isLoadingPublication = false
    },

    reset: () => initialState,
  },
})

export const readingSessionReducer = readingSessionSlice.reducer

export const selectCurrentBook = (state: RootState) =>
  state.readingSession.currentbook ?? null

export const selectCurrentLocator = (state: RootState) =>
  state.readingSession.currentLocator ?? null

export const selectCurrentlyHighlightedFragment = (state: RootState) =>
  state.readingSession.currentlyHighlightedFragment ?? null

export const selectReadingMode = (state: RootState) => state.readingSession.mode

export const selectIsSyncing = (state: RootState) =>
  state.readingSession.syncing

export const selectLastPositionUpdate = (state: RootState) =>
  state.readingSession.lastPositionUpdate ?? null

export const selectDoubleClickTimeout = (state: RootState) =>
  state.readingSession.doubleClickTimeout ?? null

export const selectIsLoadingPublication = (state: RootState) =>
  state.readingSession.isLoadingPublication

export const selectCurrentSyncTimeout = (state: RootState) =>
  state.readingSession.currentSyncTimeout ?? null

export const selectActiveFrameUrl = (state: RootState) =>
  state.readingSession.activeFrameUrl ?? null

export const selectCurrentToCLocator = createSelector(
  selectCurrentLocator,
  (currentLocator) => {
    const tocItems = getTocItems()
    if (!tocItems) return null
    if (!currentLocator) return null

    const publication = getPublication()
    const currentBaseHref =
      currentLocator.href.split("#")[0] ?? currentLocator.href

    // first try exact href match
    const exactMatch = tocItems.find(
      (item) => item.locator?.href === currentLocator.href,
    )
    if (exactMatch) return exactMatch

    // check for toc items in same file
    const candidatesWithSameFile = tocItems.filter(({ href }) => {
      const itemBaseHref = href.split("#")[0] ?? href
      return itemBaseHref === currentBaseHref
    })

    if (candidatesWithSameFile.length > 0) {
      // if there are multiple items in same file, they're fragment-based (rather than file-based)
      // note: we can't determine which one synchronously, so return the first
      // the actual progression-based matching would need to be async
      // for now, we use a heuristic: find the item whose stored progression is closest
      const currentProgression = currentLocator.locations.progression ?? 0

      let bestMatch = candidatesWithSameFile[0]
      let smallestDiff = Infinity

      for (const item of candidatesWithSameFile) {
        const itemProgression = item.locator?.locations.progression ?? 0
        const diff = Math.abs(currentProgression - itemProgression)

        if (currentProgression >= itemProgression && diff < smallestDiff) {
          smallestDiff = diff
          bestMatch = item
        }
      }

      return bestMatch ?? candidatesWithSameFile[0]
    }

    // scenario 2: sparse toc - walk backward through reading order
    if (!publication) return null

    const readingOrder = publication.readingOrder.items
    const currentReadingOrderIndex = readingOrder.findIndex(
      (item) => item.href === currentBaseHref,
    )
    if (currentReadingOrderIndex === -1) return null

    for (let i = currentReadingOrderIndex; i >= 0; i--) {
      const readingOrderItem = readingOrder[i]
      if (!readingOrderItem) continue

      const tocItem = tocItems.find((tocItem) => {
        const tocBaseHref = tocItem.href.split("#")[0] ?? tocItem.href
        return tocBaseHref === readingOrderItem.href
      })

      if (tocItem) {
        return tocItem
      }
    }

    return null
  },
)

function getAvailableMode(book: BookWithRelations) {
  if (book.readaloud && book.readaloud.status === "ALIGNED") {
    return ["readaloud"]
  }

  return [
    ...(book.audiobook ? ["audiobook"] : []),
    ...(book.ebook ? ["epub"] : []),
  ]
}

export const selectSleepTimer = (state: RootState) =>
  state.readingSession.sleepTimer ?? null

export const selectReaderError = (state: RootState) =>
  state.readingSession.error

export const selectReaderErrorMessage = (state: RootState) =>
  state.readingSession.errorMessage
