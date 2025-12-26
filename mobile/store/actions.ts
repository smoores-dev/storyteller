import { createAction } from "@reduxjs/toolkit"

import { type ReadiumLocator } from "@/modules/readium/src/Readium.types"
import { type UUID } from "@/uuid"

export const bookImported = createAction(
  "bookImported",
  (payload: { url: string }) => ({ payload }),
)

export const bookDoubleTapped = createAction(
  "bookDoubleTapped",
  (payload: {
    bookUuid: UUID
    locator: ReadiumLocator
    timestamp: number
  }) => ({
    payload,
  }),
)

export const bookDetailPressed = createAction(
  "bookDetailPressed",
  (payload: {
    bookUuid: UUID
    format: "audiobook" | "ebook" | "readaloud"
  }) => ({
    payload,
  }),
)

export const bookLocatorChanged = createAction(
  "bookLocatorChanged",
  (payload: {
    bookUuid: UUID
    locator: ReadiumLocator
    timestamp: number
  }) => ({
    payload,
  }),
)

export const miniPlayerSliderChapterPositionChanged = createAction(
  "miniPlayerSliderChapterPositionChanged",
  (payload: {
    bookUuid: UUID
    locator: ReadiumLocator
    timestamp: number
  }) => ({
    payload,
  }),
)

export const serverPositionUpdated = createAction(
  "serverPositionUpdated",
  (payload: {
    bookUuid: UUID
    locator: ReadiumLocator
    timestamp: number
  }) => ({
    payload,
  }),
)

export const navItemPressed = createAction(
  "navitemPressed",
  (payload: {
    bookUuid: UUID
    locator: ReadiumLocator
    timestamp: number
  }) => ({ payload }),
)

export const bookmarkPressed = createAction(
  "bookmarkPressed",
  (payload: {
    bookUuid: UUID
    locator: ReadiumLocator
    timestamp: number
  }) => ({ payload }),
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

export const playerPaused = createAction("playerPaused")

export const playerPlayed = createAction("playerPlayed")

export const playerTrackChanged = createAction(
  "playerTrackChanged",
  (payload: { index: number; position?: number }) => ({
    payload,
  }),
)

export const nextTrackPressed = createAction("nextTrackPressed")

export const prevTrackPressed = createAction("prevTrackPressed")

export const nextFragmentPressed = createAction("nextFragmentPressed")

export const previousFragmentPressed = createAction("previousFragmentPressed")
