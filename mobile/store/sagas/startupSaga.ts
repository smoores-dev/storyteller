import { all, call, put } from "redux-saga/effects"
import { hydrateAccessToken } from "./authSagas"
import { startupSlice } from "../slices/startupSlice"
import { hydrateBookshelf } from "./bookshelfSagas"
import { hydrateServer } from "./apiSagas"
import { logger } from "../../logger"
import { hydrateExistingDownloads } from "./librarySagas"
import { hydratePreferences } from "./preferencesSagas"

export function* startupSaga() {
  yield put(startupSlice.actions.startupHydrationStarted())
  try {
    yield call(hydrateServer)
    yield all([
      call(hydrateAccessToken),
      call(hydrateBookshelf),
      call(hydratePreferences),
    ])
    yield call(hydrateExistingDownloads)
    yield put(startupSlice.actions.startupHydrationCompleted())
  } catch (e) {
    logger.error(e)
    yield put(startupSlice.actions.startupHydrationRejected())
    return
  }
}
