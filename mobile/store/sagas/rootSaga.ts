import { all, call, fork } from "redux-saga/effects"

import {
  clearServerSaga,
  serverUpdateCommittedSaga,
  serverUpdatedSaga,
} from "./apiSagas"
import { loginSaga, logoutSaga } from "./authSagas"
import {
  deactivateKeepAwakeSaga,
  deleteBookSaga,
  deleteBookmarkSaga,
  deleteHighlightSaga,
  downloadBookSaga,
  fragmentSkipSaga,
  loadTrackPlayerSaga,
  manualTrackSeekSaga,
  persistLocatorSaga,
  playerPlaySaga,
  relocateToTrackPositionSaga,
  seekToLocatorSaga,
  sleepTimerSaga,
  syncPositionsSaga,
  updatePlayerSpeedSaga,
  writeBookmarkSaga,
  writeHighlightSaga,
} from "./bookshelfSagas"
import { requestLibrarySaga } from "./librarySagas"
import { syncDebug } from "./loggingSagas"
import {
  writeBookPreferencesSaga,
  writeGlobalPreferencesSaga,
} from "./preferencesSagas"
import { startupSaga } from "./startupSaga"

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
    call(seekToLocatorSaga),
    call(manualTrackSeekSaga),
    call(sleepTimerSaga),
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
    call(playerPlaySaga),
    call(fragmentSkipSaga),
  ])
}
