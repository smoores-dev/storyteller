import { call, select, takeEvery } from "redux-saga/effects"

import { logger } from "@/logger"
import { getDebugLoggingEnabled } from "@/store/selectors/loggingSelectors"
import { loggingSlice } from "@/store/slices/loggingSlice"

export function* syncDebug() {
  yield takeEvery(loggingSlice.actions.debugLoggingToggled, function* () {
    const debugEnabled = (yield select(getDebugLoggingEnabled)) as ReturnType<
      typeof getDebugLoggingEnabled
    >
    const newLevel = debugEnabled ? "debug" : __DEV__ ? "info" : "error"
    yield call([logger, logger.setSeverity], newLevel)
    yield call([logger, logger.info], `Logging level set to "${newLevel}"`)
  })
}
