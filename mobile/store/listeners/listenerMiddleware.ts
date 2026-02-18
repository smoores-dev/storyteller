import { addListener, createListenerMiddleware } from "@reduxjs/toolkit"
import { captureException } from "@sentry/react-native"

import { logger } from "@/logger"
import { type AppDispatch, type RootState } from "@/store/appState"

export const listenerMiddleware = createListenerMiddleware({
  onError: (error, errorInfo) => {
    logger.error(errorInfo)
    logger.error(error)
    if (process.env["EXPO_PUBLIC_ENABLE_SENTRY"]) {
      // NOTE: Sentry is _only_ enabled for debug builds used to track down
      // specific crash errors. It is _not_ included in the public Storyteller
      // releases (either in the app stores or on GitLab's release page).
      captureException(error, { extra: { errorInfo } })
    }
  },
})

export const startAppListening = listenerMiddleware.startListening.withTypes<
  RootState,
  AppDispatch
>()

export const addAppListener = addListener.withTypes<RootState, AppDispatch>()
