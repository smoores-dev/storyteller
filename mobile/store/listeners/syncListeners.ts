import { type UnknownAction, isAnyOf } from "@reduxjs/toolkit"
import TrackPlayer from "react-native-track-player"

import { getClip, getFragment } from "@/modules/readium"
import { type ReadiumLocator } from "@/modules/readium/src/Readium.types"
import {
  bookDoubleTapped,
  bookLocatorChanged,
  bookmarkPressed,
  miniPlayerSliderChapterPositionChanged,
  navItemPressed,
  nextTrackPressed,
  playerPaused,
  playerPositionSeeked,
  playerPositionUpdated,
  playerTotalPositionSeeked,
  playerTrackChanged,
  prevTrackPressed,
  serverPositionUpdated,
} from "@/store/actions"
import { localApi } from "@/store/localApi"
import {
  getCurrentlyPlayingBookUuid,
  getCurrentlyPlayingFormat,
} from "@/store/selectors/bookshelfSelectors"
import { type BookshelfTrack } from "@/store/slices/bookshelfSlice"
import { type UUID } from "@/uuid"

import { startAppListening } from "./listenerMiddleware"

const matchReaderLocatorUpdate = isAnyOf(
  bookDoubleTapped,
  miniPlayerSliderChapterPositionChanged,
  bookLocatorChanged,
  serverPositionUpdated,
  navItemPressed,
  bookmarkPressed,
)

startAppListening({
  matcher: matchReaderLocatorUpdate,
  effect: async (action, listenerApi) => {
    const { bookUuid, locator, timestamp } = action.payload

    const currentlyPlaying = getCurrentlyPlayingBookUuid(listenerApi.getState())
    if (bookUuid !== currentlyPlaying) return
    const format = getCurrentlyPlayingFormat(listenerApi.getState())
    if (!format) return

    await listenerApi
      .dispatch(
        localApi.endpoints.updatePosition.initiate({
          bookUuid,
          locator,
          timestamp,
        }),
      )
      .unwrap()

    const book = await listenerApi
      .dispatch(localApi.endpoints.getBook.initiate({ uuid: bookUuid }))
      .unwrap()

    if (!book) return

    const clip =
      book.position && (await getClip(book, format, book.position.locator))

    if (!clip) return

    const tracks = (await TrackPlayer.getQueue()) as BookshelfTrack[]

    const trackIndex = tracks.findIndex(
      (track) => track.relativeUrl === clip.relativeUrl,
    )

    if (trackIndex !== -1) {
      await TrackPlayer.skip(trackIndex, clip.start)
    }

    if (action.type === bookDoubleTapped.type) {
      await TrackPlayer.play()
    }
  },
})

const matchPlayerPositionUpdate = isAnyOf(
  playerTotalPositionSeeked,
  playerPositionSeeked,
  playerTrackChanged,
  nextTrackPressed,
  prevTrackPressed,
)

startAppListening({
  matcher: matchPlayerPositionUpdate,
  effect: async (action, listenerApi) => {
    listenerApi.unsubscribe()

    let queued: UnknownAction | null = null
    listenerApi
      .take((action) => action.type === playerPositionUpdated.type)
      .then(([action]) => (queued = action))
      .catch(() => {})

    try {
      switch (action.type) {
        case playerTotalPositionSeeked.type: {
          const { progress } = action.payload

          let skipTo = progress
          let nextTrack = null

          const tracks = await TrackPlayer.getQueue()

          let acc = 0
          for (let i = 0; i < tracks.length; i++) {
            const track = tracks[i]!
            acc += track.duration ?? 0
            if (acc > progress) break
            nextTrack = i
            skipTo -= track.duration ?? 0
          }
          if (nextTrack === null) return

          await TrackPlayer.skip(nextTrack, skipTo)
          break
        }
        case playerPositionSeeked.type: {
          const { progress } = action.payload

          await TrackPlayer.seekTo(progress)
          break
        }
        case playerTrackChanged.type: {
          const { index, position } = action.payload
          await TrackPlayer.skip(index, position)
          break
        }
        case nextTrackPressed.type: {
          await TrackPlayer.skipToNext()
          break
        }
        case prevTrackPressed.type: {
          await TrackPlayer.skipToPrevious()
          break
        }
      }

      listenerApi.dispatch(playerPositionUpdated())
    } finally {
      listenerApi.subscribe()
      if (queued) {
        listenerApi.dispatch(queued)
      }
    }
  },
})

const matchPlayerUpdatedOrPaused = isAnyOf(playerPositionUpdated, playerPaused)

async function getLocatorFromTrackPosition(
  bookUuid: UUID,
  format: "ebook" | "readaloud" | "audiobook",
  track: BookshelfTrack,
  position: number,
): Promise<ReadiumLocator | undefined> {
  if (format !== "audiobook") {
    const fragment = await getFragment(bookUuid, track.relativeUrl, position)
    return fragment?.locator
  }

  const tracks = await TrackPlayer.getQueue()

  let prev = true
  let prevDuration = 0
  let totalDuration = 0
  for (const t of tracks) {
    if (t === track) {
      prev = false
    }
    if (prev) {
      prevDuration += t.duration ?? 0
    }
    totalDuration += t.duration ?? 0
  }

  return {
    href: track.relativeUrl,
    title: track.title,
    type: track.mimeType,
    locations: {
      fragments: [`t=${position}`],
      progression: position / track.duration!,
      totalProgression: (prevDuration + position) / totalDuration,
    },
  }
}

startAppListening({
  matcher: matchPlayerUpdatedOrPaused,
  effect: async (_, listenerApi) => {
    listenerApi.unsubscribe()

    let queued = false
    listenerApi
      .take((action) => action.type === playerPositionUpdated.type)
      .then(() => (queued = true))
      .catch(() => {})

    try {
      const currentTrack = (await TrackPlayer.getActiveTrack()) as
        | BookshelfTrack
        | undefined

      if (!currentTrack) return

      const { position } = await TrackPlayer.getProgress()

      const currentBookUuid = getCurrentlyPlayingBookUuid(
        listenerApi.getState(),
      )
      if (!currentBookUuid) return

      const format = getCurrentlyPlayingFormat(listenerApi.getState())
      if (!format) return

      const locator = await getLocatorFromTrackPosition(
        currentBookUuid,
        format,
        currentTrack,
        position,
      )

      if (!locator) return

      const payload = {
        bookUuid: currentBookUuid,
        locator: locator,
        timestamp: Date.now(),
      }

      await listenerApi
        .dispatch(localApi.endpoints.updatePosition.initiate(payload))
        .unwrap()
    } finally {
      listenerApi.subscribe()
      if (queued) {
        listenerApi.dispatch(playerPositionUpdated())
      }
    }
  },
})
