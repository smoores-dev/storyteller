import { all, call, fork } from "redux-saga/effects"
import { loginSaga, logoutSaga } from "./authSagas"
import { startupSaga } from "./startupSaga"
import { requestLibrarySaga } from "./librarySagas"
import {
  deactivateKeepAwakeSaga,
  deleteBookSaga,
  deleteBookmarkSaga,
  downloadBookSaga,
  loadTrackPlayerSaga,
  persistLocatorSaga,
  relocateToTrackPositionSaga,
  seekToLocatorSaga,
} from "./bookshelfSagas"
import {
  clearServerSaga,
  serverUpdateCommittedSaga,
  serverUpdatedSaga,
} from "./apiSagas"
import { syncDebug } from "./loggingSagas"

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
    call(relocateToTrackPositionSaga),
    call(deleteBookSaga),
    call(deleteBookmarkSaga),
    call(clearServerSaga),
    call(logoutSaga),
    call(syncDebug),
  ])
}
