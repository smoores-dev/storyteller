import { isPast } from "date-fns"

import { Storyteller } from "@/modules/readium"
import { getSleepTimer } from "@/store/selectors/bookshelfSelectors"
import { bookshelfSlice } from "@/store/slices/bookshelfSlice"

import { startAppListening } from "./listenerMiddleware"

startAppListening({
  actionCreator: bookshelfSlice.actions.audioPositionChanged,
  effect: async (_, listenerApi) => {
    const sleepTimer = getSleepTimer(listenerApi.getState())
    if (sleepTimer === null) return

    if (isPast(sleepTimer)) {
      await Storyteller.pause()
      listenerApi.dispatch(bookshelfSlice.actions.sleepTimerExpired())
    }
  },
})
