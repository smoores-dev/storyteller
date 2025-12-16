import { isAnyOf } from "@reduxjs/toolkit"

import { isSameLocator } from "@/components/reader/locators"
import { serverPositionUpdated, syncPosition } from "@/store/actions"
import { api } from "@/store/api"
import { preferencesSlice } from "@/store/slices/preferencesSlice"
import {
  readingSessionSlice,
  selectCurrentLocator,
  selectCurrentSyncTimeout,
} from "@/store/slices/readingSessionSlice"

import { startAppListening } from "./listenerMiddleware"

const matchSyncPosition = isAnyOf(syncPosition)

startAppListening({
  matcher: matchSyncPosition,
  effect: async (action, listenerApi) => {
    listenerApi.unsubscribe()

    try {
      const currentLocator = selectCurrentLocator(listenerApi.getState())
      if (
        currentLocator &&
        isSameLocator(action.payload.locator, currentLocator)
      ) {
        return
      }

      listenerApi.dispatch(
        readingSessionSlice.actions.updateLocator({
          locator: action.payload.locator,
          timestamp: action.payload.timestamp,
        }),
      )

      if (action.payload.noServer) {
        return
      }

      const currentSyncTimeout = selectCurrentSyncTimeout(
        listenerApi.getState(),
      )

      if (currentSyncTimeout) {
        return
      }

      await listenerApi.fork(async () => {
        try {
          await listenerApi
            .dispatch(
              api.endpoints.updatePosition.initiate({
                uuid: action.payload.bookUuid,
                position: {
                  locator: action.payload.locator,
                  timestamp: action.payload.timestamp,
                },
              }),
            )
            .unwrap()

          // update currently listening book id
          listenerApi.dispatch(
            preferencesSlice.actions.updatePreference({
              key: "currentlyListeningBookId",
              value: action.payload.bookUuid,
              target: "global",
            }),
          )

          listenerApi.dispatch(
            serverPositionUpdated({
              bookUuid: action.payload.bookUuid,
              locator: action.payload.locator,
              timestamp: action.payload.timestamp,
            }),
          )
        } catch (getError) {
          console.error(`Failed to get new position`)
          console.error(getError)
          // Ignore any errors here; we'll retry again at the next interval anyway
        }
      }).result

      const timeout = window.setTimeout(() => {
        listenerApi.dispatch(
          readingSessionSlice.actions.setCurrentSyncTimeout(null),
        )
      }, 10_000)

      listenerApi.dispatch(
        readingSessionSlice.actions.setCurrentSyncTimeout(timeout),
      )
    } finally {
      listenerApi.subscribe()
    }
  },
})
