import * as BackgroundTask from "expo-background-task"
import * as TaskManager from "expo-task-manager"

import { syncPositions } from "@/store/listeners/positionSyncListener"
import { store } from "@/store/store"

const BACKGROUND_POSITION_SYNC_TASK = "background-position-sync"

TaskManager.defineTask(BACKGROUND_POSITION_SYNC_TASK, async () => {
  store.getState()

  await syncPositions(store.dispatch)

  return BackgroundTask.BackgroundTaskResult.Success
})

export async function registerBackgroundTaskAsync() {
  BackgroundTask.registerTaskAsync(BACKGROUND_POSITION_SYNC_TASK, {
    minimumInterval: 30,
  })
}
