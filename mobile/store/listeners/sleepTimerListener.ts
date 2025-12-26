import { isPast } from "date-fns"
import TrackPlayer from "react-native-track-player"

import { playerPositionUpdated } from "@/store/actions"
import { getSleepTimer } from "@/store/selectors/bookshelfSelectors"
import { bookshelfSlice } from "@/store/slices/bookshelfSlice"

import { startAppListening } from "./listenerMiddleware"

startAppListening({
  actionCreator: playerPositionUpdated,
  effect: async (_, listenerApi) => {
    const sleepTimer = getSleepTimer(listenerApi.getState())
    if (sleepTimer === null) return

    if (isPast(sleepTimer)) {
      await TrackPlayer.pause()
      listenerApi.dispatch(bookshelfSlice.actions.sleepTimerExpired())
    }
  },
})
