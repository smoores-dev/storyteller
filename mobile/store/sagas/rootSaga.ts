import { all, call, fork } from "redux-saga/effects"
import { loginSaga, logoutSaga } from "./authSagas"
import { startupSaga } from "./startupSaga"
import { requestLibrarySaga } from "./librarySagas"
import {
  deactivateKeepAwakeSaga,
  deleteBookSaga,
  deleteBookmarkSaga,
  deleteHighlightSaga,
  downloadBookSaga,
  ensureTrackPlaySaga,
  loadTrackPlayerSaga,
  persistLocatorSaga,
  relocateToTrackPositionSaga,
  seekToLocatorSaga,
  writeBookmarkSaga,
  writeHighlightSaga,
  updatePlayerSpeedSaga,
  syncPositionsSaga,
  manualTrackSeekSaga,
} from "./bookshelfSagas"
import {
  clearServerSaga,
  serverUpdateCommittedSaga,
  serverUpdatedSaga,
} from "./apiSagas"
import { syncDebug } from "./loggingSagas"
import {
  writeBookPreferencesSaga,
  writeGlobalPreferencesSaga,
} from "./preferencesSagas"

export function* rootSaga() {
  yield fork(serverUpdatedSaga)
  yield fork(serverUpdateCommittedSaga)
  yield fork(loginSaga)
  yield call(startupSaga)
  yield all([
    call(deactivateKeepAwakeSaga),
    call(downloadBookSaga),
    call(requestLibrarySaga),
    call(persistLocatorSaga),
    call(loadTrackPlayerSaga),
    call(ensureTrackPlaySaga),
    call(seekToLocatorSaga),
    call(manualTrackSeekSaga),
    call(relocateToTrackPositionSaga),
    call(deleteBookSaga),
    call(deleteBookmarkSaga),
    call(writeBookmarkSaga),
    call(deleteHighlightSaga),
    call(writeHighlightSaga),
    call(updatePlayerSpeedSaga),
    call(writeBookPreferencesSaga),
    call(writeGlobalPreferencesSaga),
    call(clearServerSaga),
    call(logoutSaga),
    call(syncDebug),
    call(syncPositionsSaga),
  ])
}
