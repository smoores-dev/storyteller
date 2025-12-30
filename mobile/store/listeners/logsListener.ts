import { logger } from "@/logger"
import { loggingSlice } from "@/store/slices/loggingSlice"

import { startAppListening } from "./listenerMiddleware"

startAppListening({
  actionCreator: loggingSlice.actions.debugLoggingToggled,
  effect: (_, listenerApi) => {
    if (listenerApi.getState().logging.debugEnabled) {
      logger.setSeverity("debug")
    } else {
      logger.setSeverity(__DEV__ ? "info" : "error")
    }
  },
})
