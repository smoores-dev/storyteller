import { type Locator } from "@readium/shared"
import { createAction } from "@reduxjs/toolkit"

import { type UUID } from "@/uuid"

export const bookDoubleTapped = createAction(
  "bookDoubleTapped",
  (payload: { bookUuid: UUID; locator: Locator; timestamp: number }) => ({
    payload,
  }),
)

export const bookLocatorChanged = createAction(
  "bookLocatorChanged",
  (payload: { bookUuid: UUID; locator: Locator; timestamp: number }) => ({
    payload,
  }),
)

export const miniPlayerSliderChapterPositionChanged = createAction(
  "miniPlayerSliderChapterPositionChanged",
  (payload: { bookUuid: UUID; locator: Locator; timestamp: number }) => ({
    payload,
  }),
)

export const serverPositionUpdated = createAction(
  "serverPositionUpdated",
  (payload: { bookUuid: UUID; locator: Locator; timestamp: number }) => ({
    payload,
  }),
)

export const navItemPressed = createAction(
  "navitemPressed",
  (payload: { locator: Locator }) => ({
    payload,
  }),
)

export const bookmarkPressed = createAction(
  "bookmarkPressed",
  (payload: { locator: Locator }) => ({
    payload,
  }),
)

export const playerPositionUpdated = createAction("playerPositionUpdated")

export const playerPositionSeeked = createAction(
  "playerPositionSeeked",
  (payload: { progress: number }) => ({
    payload,
  }),
)

export const playerTotalPositionSeeked = createAction(
  "playerTotalPositionSeeked",
  (payload: { progress: number }) => ({
    payload,
  }),
)

export const localBookImported = createAction(
  "localBookImported",
  (bookId: number, archiveUrl: string) => ({ payload: { bookId, archiveUrl } }),
)

export const playerPaused = createAction("playerPaused")

export const playerPlayed = createAction("playerPlayed")

export const playerTrackChanged = createAction(
  "playerTrackChanged",
  (payload: { index: number; start?: number }) => ({
    payload,
  }),
)

export const playerPositionUpdateCompleted = createAction(
  "playerPositionUpdateCompleted",
  (payload: { bookUuid: UUID; locator: Locator; timestamp: number }) => ({
    payload,
  }),
)

export type SkipPartButtonPayload = {
  direction: "next" | "previous"
  context: "reader" | "miniplayer"
}
export const skipPartButtonPressed = createAction(
  "skipPartButtonPressed",
  (payload: SkipPartButtonPayload) => ({
    payload,
  }),
)

export const skipPartButtonHeld = createAction(
  "skipPartButtonHeld",
  (payload: SkipPartButtonPayload) => ({
    payload,
  }),
)

export const trackSkipRequested = createAction(
  "trackSkipRequested",
  (payload: { trackIndex: number; start?: number }) => ({
    payload,
  }),
)

export const nextPagePressed = createAction("nextPagePressed")

export const previousPagePressed = createAction("previousPagePressed")

// audio system needs to sync text position (does NOT trigger audio update)
export const textNavigatedFromAudio = createAction(
  "textNavigatedFromAudio",
  (payload: { locator: Locator }) => ({
    payload,
  }),
)

export const userRequestedTextNavigation = createAction(
  "userRequestedTextNavigation",
  (payload: { locator: Locator }) => ({
    payload,
  }),
)

export const syncPosition = createAction(
  "syncPosition",
  (payload: {
    locator: Locator
    timestamp: number
    bookUuid: UUID
    noServer?: boolean
  }) => ({
    payload,
  }),
)

export const cycleDetailView = createAction("cycleDetailView")

export const togglePlay = createAction("togglePlay")

export const requestHighlightUpdate = createAction(
  "requestHighlightUpdate",
  (payload: { locator: Locator }) => ({
    payload,
  }),
)
