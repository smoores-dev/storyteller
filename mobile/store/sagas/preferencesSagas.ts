import { call, put, select, takeEvery } from "redux-saga/effects"
import {
  readBookPreferences,
  readGlobalPreferences,
  writeBookPreferences,
  writeGlobalPreferences,
} from "../persistence/preferences"
import {
  PreferencesState,
  defaultPreferences,
  preferencesSlice,
} from "../slices/preferencesSlice"
import { readBookIds } from "../persistence/books"
import {
  getBookPreferences,
  getGlobalPreferences,
} from "../selectors/preferencesSelectors"

export function* hydratePreferences() {
  const globalPreferences =
    ((yield call(readGlobalPreferences)) as Awaited<
      ReturnType<typeof readGlobalPreferences>
    >) ?? defaultPreferences

  const bookIds =
    ((yield call(readBookIds)) as Awaited<ReturnType<typeof readBookIds>>) ?? []

  const bookPreferencePromises = bookIds.map((bookId) =>
    readBookPreferences(bookId),
  )
  const bookPreferences = (yield call(
    Promise.all,
    bookPreferencePromises,
  )) as Awaited<ReturnType<typeof Promise.all<typeof bookPreferencePromises>>>

  const bookPreferencesRecord = Object.fromEntries(
    bookPreferences.map(
      (prefs, index) => [bookIds[index]!, prefs ?? {}] as const,
    ),
  )

  const preferences: PreferencesState = {
    ...globalPreferences,
    bookPreferences: bookPreferencesRecord,
  }

  yield put(preferencesSlice.actions.preferencesHydrated(preferences))
}

export function* writeBookPreferencesSaga() {
  yield takeEvery(
    [
      preferencesSlice.actions.playerSpeedChanged,
      preferencesSlice.actions.bookPreferencesUpdated,
    ],
    function* (action) {
      const { bookId } = action.payload

      const bookPreferences = (yield select(
        getBookPreferences,
        bookId,
      )) as ReturnType<typeof getBookPreferences>

      if (!bookPreferences) return

      yield call(writeBookPreferences, bookId, bookPreferences)
    },
  )
}

export function* writeGlobalPreferencesSaga() {
  yield takeEvery(
    [
      preferencesSlice.actions.globalPreferencesUpdated,
      preferencesSlice.actions.bookPreferencesSetAsDefaults,
    ],
    function* () {
      const { bookPreferences: _, ...preferences } = (yield select(
        getGlobalPreferences,
      )) as ReturnType<typeof getGlobalPreferences>

      yield call(writeGlobalPreferences, preferences)
    },
  )
}
