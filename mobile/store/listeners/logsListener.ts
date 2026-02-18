import { getPreferences } from "@/database/preferences"
import { logger } from "@/logger"
import { localApi } from "@/store/localApi"

import { startAppListening } from "./listenerMiddleware"

startAppListening({
  matcher: localApi.endpoints.updateGlobalPreference.matchPending,
  effect: async (_, listenerApi) => {
    const { data: preferences } =
      localApi.endpoints.getGlobalPreferences.select()(listenerApi.getState())

    if (!preferences) return

    if (logger.getSeverity() === preferences.logLevel) return

    logger.setSeverity(preferences.logLevel)
  },
})

startAppListening({
  predicate: () => true,
  effect: async (_, listenerApi) => {
    listenerApi.unsubscribe()
    const { logLevel } = await getPreferences()
    logger.setSeverity(logLevel)
  },
})
