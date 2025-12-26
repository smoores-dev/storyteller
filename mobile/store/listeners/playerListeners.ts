import {
  type PayloadAction,
  type UnknownAction,
  isAnyOf,
} from "@reduxjs/toolkit"
import { isPast } from "date-fns"
import TrackPlayer from "react-native-track-player"

import { type BookPreferences } from "@/database/preferencesTypes"
import {
  getClip,
  getNextFragment,
  getPreviousFragment,
} from "@/modules/readium"
import {
  nextFragmentPressed,
  playerPlayed,
  previousFragmentPressed,
} from "@/store/actions"
import { localApi } from "@/store/localApi"
import {
  getCurrentlyPlayingBookUuid,
  getCurrentlyPlayingFormat,
  getSleepTimer,
} from "@/store/selectors/bookshelfSelectors"
import {
  type BookshelfTrack,
  bookshelfSlice,
} from "@/store/slices/bookshelfSlice"
import { type UUID } from "@/uuid"

import { startAppListening } from "./listenerMiddleware"

const predicate = (
  action: UnknownAction,
): action is PayloadAction<
  null,
  string,
  {
    arg: {
      originalArgs: {
        bookUuid: UUID
        name: "audio"
        value: Required<NonNullable<BookPreferences["audio"]>>
      }
    }
  }
> => {
  return (
    localApi.endpoints.updateBookPreference.matchFulfilled(action) &&
    action.meta.arg.originalArgs.name === "audio" &&
    (action.meta.arg.originalArgs.value as BookPreferences["audio"])?.speed !==
      undefined
  )
}

startAppListening({
  predicate,
  effect: async (action) => {
    const speed = action.meta.arg.originalArgs.value.speed

    await TrackPlayer.setRate(speed)
  },
})

const FIVE_MINUTES_IN_MILLIS = 5 * 60 * 1000

startAppListening({
  actionCreator: playerPlayed,
  effect: async (_, listenerApi) => {
    const preferences = await listenerApi
      .dispatch(localApi.endpoints.getGlobalPreferences.initiate())
      .unwrap()

    const sleepTimer = getSleepTimer(listenerApi.getState())

    if (sleepTimer && isPast(sleepTimer)) {
      listenerApi.dispatch(bookshelfSlice.actions.sleepTimerExpired())
    }
    if (!preferences.automaticRewind.enabled) {
      await TrackPlayer.play()
      return
    }

    const currentBookUuid = getCurrentlyPlayingBookUuid(listenerApi.getState())

    if (!currentBookUuid) {
      await TrackPlayer.play()
      return
    }

    const book = await listenerApi
      .dispatch(localApi.endpoints.getBook.initiate({ uuid: currentBookUuid }))
      .unwrap()

    if (!book?.position) {
      await TrackPlayer.play()
      return
    }

    const { timestamp } = book.position
    if (Date.now() - timestamp < FIVE_MINUTES_IN_MILLIS) {
      await TrackPlayer.seekBy(-preferences.automaticRewind.afterInterruption)
    } else {
      await TrackPlayer.seekBy(-preferences.automaticRewind.afterBreak)
    }

    await TrackPlayer.play()
  },
})

const matchFragmentButtonPressed = isAnyOf(
  nextFragmentPressed,
  previousFragmentPressed,
)

startAppListening({
  matcher: matchFragmentButtonPressed,
  effect: async (action, listenerApi) => {
    const currentBookUuid = getCurrentlyPlayingBookUuid(listenerApi.getState())

    if (!currentBookUuid) return

    const format = getCurrentlyPlayingFormat(listenerApi.getState())
    if (!format) return

    const book = await listenerApi
      .dispatch(localApi.endpoints.getBook.initiate({ uuid: currentBookUuid }))
      .unwrap()

    if (!book?.position) return

    const navigateTo = await (
      action.type === nextFragmentPressed.type
        ? getNextFragment
        : getPreviousFragment
    )(book.uuid, book.position.locator)

    if (!navigateTo) return

    const clip = await getClip(book, format, navigateTo.locator)
    if (!clip) return

    const tracks = (await TrackPlayer.getQueue()) as BookshelfTrack[]

    const trackIndex = tracks.findIndex(
      (track) => track.relativeUrl === clip.relativeUrl,
    )

    const currentTrackIndex = await TrackPlayer.getActiveTrackIndex()

    if (trackIndex === -1) return

    if (trackIndex === currentTrackIndex) {
      await TrackPlayer.seekTo(clip.start)
    } else {
      await TrackPlayer.skip(trackIndex, clip.start)
    }
  },
})
