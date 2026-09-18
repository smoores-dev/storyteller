import { isPast } from "date-fns"

import { readerPlayer } from "@/services/AudioPlayerService"
import { playerPositionUpdated } from "@/store/actions"
import {
  readingSessionSlice,
  selectSleepTimer,
} from "@/store/slices/readingSessionSlice"

import { startAppListening } from "./listenerMiddleware"

startAppListening({
  actionCreator: playerPositionUpdated,
  effect: (_, listenerApi) => {
    const sleepTimer = selectSleepTimer(listenerApi.getState())
    if (sleepTimer === null) return

    if (isPast(sleepTimer)) {
      readerPlayer().pause()
      listenerApi.dispatch(readingSessionSlice.actions.sleepTimerExpired())
    }
  },
})
