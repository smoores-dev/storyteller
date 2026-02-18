import {
  type PayloadAction,
  type UnknownAction,
  isAnyOf,
} from "@reduxjs/toolkit"

import {
  type BookPreferences,
  type Preferences,
} from "@/database/preferencesTypes"
import { logger } from "@/logger"
import {
  Storyteller,
  getClip,
  getNextFragment,
  getPreviousFragment,
} from "@/modules/readium"
import { nextFragmentPressed, previousFragmentPressed } from "@/store/actions"
import { localApi } from "@/store/localApi"
import {
  getCurrentlyPlayingBookUuid,
  getCurrentlyPlayingFormat,
} from "@/store/selectors/bookshelfSelectors"
import { bookshelfSlice } from "@/store/slices/bookshelfSlice"
import { type UUID } from "@/uuid"

import { startAppListening } from "./listenerMiddleware"

const speedChangedPredicate = (
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
  predicate: speedChangedPredicate,
  effect: async (action) => {
    const speed = action.meta.arg.originalArgs.value.speed

    logger.debug(
      `Playback speed changed for current book, updating to ${speed}`,
    )
    await Storyteller.setRate(speed)
  },
})

const automaticRewindChangedPredicate = (
  action: UnknownAction,
): action is PayloadAction<
  null,
  string,
  {
    arg: {
      originalArgs: {
        name: "automaticRewind"
        value: Required<NonNullable<Preferences["automaticRewind"]>>
      }
    }
  }
> => {
  return (
    localApi.endpoints.updateGlobalPreference.matchFulfilled(action) &&
    action.meta.arg.originalArgs.name === "automaticRewind" &&
    (action.meta.arg.originalArgs.value as Preferences["automaticRewind"]) !==
      undefined
  )
}

startAppListening({
  predicate: automaticRewindChangedPredicate,
  effect: async (action) => {
    const config = action.meta.arg.originalArgs.value

    logger.debug(
      `Automatic rewind config changed, updating to ${JSON.stringify(config)}`,
    )
    await Storyteller.setAutomaticRewind(config)
  },
})

startAppListening({
  matcher: localApi.endpoints.getGlobalPreferences.matchFulfilled,
  effect: async (_, listenerApi) => {
    const config = localApi.endpoints.getGlobalPreferences.select()(
      listenerApi.getState(),
    ).data?.automaticRewind
    if (!config) return

    logger.debug(
      `Automatic rewind config changed, updating to ${JSON.stringify(config)}`,
    )
    await Storyteller.setAutomaticRewind(config)
  },
})

const matchFragmentButtonPressed = isAnyOf(
  nextFragmentPressed,
  previousFragmentPressed,
)

startAppListening({
  matcher: matchFragmentButtonPressed,
  effect: async (action, listenerApi) => {
    logger.debug(action.type)
    const currentBookUuid = getCurrentlyPlayingBookUuid(listenerApi.getState())

    if (!currentBookUuid) return

    const format = getCurrentlyPlayingFormat(listenerApi.getState())
    if (!format) return

    const book = await listenerApi
      .dispatch(localApi.endpoints.getBook.initiate({ uuid: currentBookUuid }))
      .unwrap()

    if (!book?.position) {
      logger.debug(`No local position for book, aborting`)
      return
    }

    const navigateTo = await (
      action.type === nextFragmentPressed.type
        ? getNextFragment
        : getPreviousFragment
    )(book.uuid, book.position.locator)

    if (!navigateTo) {
      logger.debug(`Could not find next locator, aborting`)
      return
    }
    const positions =
      format !== "audiobook"
        ? await listenerApi
            .dispatch(
              localApi.endpoints.getBookPositions.initiate(
                { bookUuid: currentBookUuid, format },
                { forceRefetch: false },
              ),
            )
            .unwrap()
        : null

    const clip = await getClip(book, format, navigateTo.locator, positions)
    if (!clip) return

    logger.debug(`Seeking to ${clip.start}s in ${clip.relativeUrl}`)
    await Storyteller.seekTo(clip.relativeUrl, clip.start)
  },
})

startAppListening({
  actionCreator: bookshelfSlice.actions.miniPlayerWidgetSwiped,
  effect: async () => {
    logger.debug(`Mini player closed, unloading audio player`)
    await Storyteller.pause()
    await Storyteller.unload()
  },
})
