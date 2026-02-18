import { isAnyOf } from "@reduxjs/toolkit"

import { Storyteller, getClip, getFragment } from "@/modules/readium"
import {
  type ReadiumLocator,
  type StorytellerTrack,
} from "@/modules/readium/src/Readium.types"
import {
  bookDoubleTapped,
  bookLocatorChanged,
  bookmarkPressed,
  miniPlayerSliderChapterPositionChanged,
  navItemPressed,
  nextTrackPressed,
  playerClipChanged,
  playerPositionSeeked,
  playerTotalPositionSeeked,
  playerTrackChanged,
  prevTrackPressed,
  serverPositionUpdated,
} from "@/store/actions"
import { localApi } from "@/store/localApi"
import {
  getCurrentlyPlayingBookUuid,
  getCurrentlyPlayingFormat,
  getIsPlaying,
} from "@/store/selectors/bookshelfSelectors"
import { bookshelfSlice } from "@/store/slices/bookshelfSlice"
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

    const currentlyPlaying = getCurrentlyPlayingBookUuid(listenerApi.getState())
    if (bookUuid !== currentlyPlaying) return

    const format = getCurrentlyPlayingFormat(listenerApi.getState())
    if (!format) return

    const positions =
      format !== "audiobook"
        ? await listenerApi
            .dispatch(
              localApi.endpoints.getBookPositions.initiate(
                { bookUuid, format },
                { forceRefetch: false },
              ),
            )
            .unwrap()
        : null

    const clip =
      book.position &&
      (await getClip(book, format, book.position.locator, positions))

    if (!clip) return

    if (action.type === bookDoubleTapped.type) {
      // this prevents the previous clip from being highlighted briefly when double tapping
      await Storyteller.seekTo(clip.relativeUrl, clip.start + 0.01, true)
      await Storyteller.play(false)
    } else {
      await Storyteller.seekTo(clip.relativeUrl, clip.start, true)
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

    try {
      switch (action.type) {
        // case playerTotalPositionSeeked.type: {
        // const { progress } = action.payload

        // let skipTo = progress
        // let nextTrack = null

        // const tracks = await TrackPlayer.getQueue()

        // let acc = 0
        // for (let i = 0; i < tracks.length; i++) {
        //   const track = tracks[i]!
        //   acc += track.duration ?? 0
        //   if (acc > progress) break
        //   nextTrack = i
        //   skipTo -= track.duration ?? 0
        // }
        // if (nextTrack === null) return

        // await TrackPlayer.skip(nextTrack, skipTo)
        // break
        // }
        case playerPositionSeeked.type: {
          const { progress } = action.payload

          await Storyteller.skip(progress)
          break
        }
        case playerTrackChanged.type: {
          const { relativeUri, position } = action.payload
          await Storyteller.seekTo(relativeUri, position ?? 0)
          break
        }
        case nextTrackPressed.type: {
          await Storyteller.next()
          break
        }
        case prevTrackPressed.type: {
          await Storyteller.prev()
          break
        }
      }
    } finally {
      listenerApi.subscribe()
    }
  },
})

async function getLocatorFromTrackPosition(
  bookUuid: UUID,
  format: "ebook" | "readaloud" | "audiobook",
  track: StorytellerTrack,
  position: number,
): Promise<ReadiumLocator | undefined> {
  if (format !== "audiobook") {
    const fragment = await getFragment(bookUuid, track.relativeUri, position)
    return fragment?.locator
  }

  const tracks = await Storyteller.getTracks()

  let prev = true
  let prevDuration = 0
  let totalDuration = 0
  for (const t of tracks) {
    if (t.relativeUri === track.relativeUri) {
      prev = false
    }
    if (prev) {
      prevDuration += t.duration ?? 0
    }
    totalDuration += t.duration ?? 0
  }

  return {
    href: track.relativeUri,
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
  actionCreator: bookshelfSlice.actions.isPlayingChanged,
  effect: async (action, listenerApi) => {
    if (action.payload.isPlaying) return
    if (
      getIsPlaying(listenerApi.getOriginalState()) ===
      getIsPlaying(listenerApi.getState())
    )
      return

    listenerApi.unsubscribe()
    try {
      const currentTrack = await Storyteller.getCurrentTrack()
      if (!currentTrack) return

      const position = await Storyteller.getPosition()

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
    }
  },
})

startAppListening({
  actionCreator: playerClipChanged,
  effect: async (action, listenerApi) => {
    listenerApi.unsubscribe()
    try {
      const { clip } = action.payload
      const currentBookUuid = getCurrentlyPlayingBookUuid(
        listenerApi.getState(),
      )
      if (!currentBookUuid) return
      const locator = clip.locator

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
    }
  },
})
