import { isPast } from "date-fns"

import { AudioPlayer } from "@/services/AudioPlayerService"

import { playerPositionUpdated } from "../actions"
import {
  readingSessionSlice,
  selectSleepTimer,
} from "../slices/readingSessionSlice"

import { startAppListening } from "./listenerMiddleware"

startAppListening({
  actionCreator: playerPositionUpdated,
  effect: (_, listenerApi) => {
    const sleepTimer = selectSleepTimer(listenerApi.getState())
    if (sleepTimer === null) return

    if (isPast(sleepTimer)) {
      AudioPlayer.pause()
      listenerApi.dispatch(readingSessionSlice.actions.sleepTimerExpired())
    }
  },
})
