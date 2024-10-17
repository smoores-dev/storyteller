import * as BackgroundFetch from "expo-background-fetch"
import * as TaskManager from "expo-task-manager"
import {
  getBookshelfBookIds,
  getLocator,
} from "../store/selectors/bookshelfSelectors"
import { store } from "../store/store"
import { getApiClient } from "../store/selectors/apiSelectors"
import { ApiClientError } from "../apiClient"
import { bookshelfSlice } from "../store/slices/bookshelfSlice"

const BACKGROUND_POSITION_SYNC_TASK = "background-position-sync"

TaskManager.defineTask(BACKGROUND_POSITION_SYNC_TASK, async () => {
  const apiClient = getApiClient(store.getState())
  if (!apiClient?.isAuthenticated()) {
    return BackgroundFetch.BackgroundFetchResult.NoData
  }

  const bookIds = getBookshelfBookIds(store.getState())

  for (const bookId of bookIds) {
    const timestampedLocator = getLocator(store.getState(), bookId)
    if (!timestampedLocator) continue
    const { timestamp, locator } = timestampedLocator
    try {
      await apiClient?.syncPosition(bookId, locator, timestamp)
    } catch (e) {
      if (e instanceof ApiClientError && e.statusCode === 409) {
        try {
          const newPosition = await apiClient.getSyncedPosition(bookId)

          store.dispatch(
            bookshelfSlice.actions.bookPositionSynced({
              bookId,
              locator: newPosition,
            }),
          )
        } catch {
          // Ignore any errors here; we'll retry again at the next interval anyway
        }
      }
    }
  }

  return BackgroundFetch.BackgroundFetchResult.NewData
})

BackgroundFetch.registerTaskAsync(BACKGROUND_POSITION_SYNC_TASK, {
  minimumInterval: 60 * 15, // 15 minutes
})
