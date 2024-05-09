import * as SecureStore from "expo-secure-store"
import { call, put, select, takeEvery } from "redux-saga/effects"
import {
  authSlice,
  loginButtonTapped,
  loginCredentialsHydrated,
} from "../slices/authSlice"
import { getApiBaseUrl } from "../selectors/apiSelectors"
import { ApiClient } from "../../apiClient"
import { apiSlice } from "../slices/apiSlice"
import { router } from "expo-router"
import { logger } from "../../logger"
import { Token } from "../../apiModels"

export function* loginSaga() {
  yield takeEvery(
    [loginButtonTapped, loginCredentialsHydrated],
    function* (action) {
      const { username, password } = action.payload

      yield call(
        SecureStore.setItemAsync,
        "st_credentials",
        JSON.stringify({ username, password }),
      )

      const apiBaseUrl = (yield select(getApiBaseUrl)) as ReturnType<
        typeof getApiBaseUrl
      >

      if (!apiBaseUrl) return
      const url = new URL(apiBaseUrl)

      const apiClient = new ApiClient(url.origin, url.pathname)

      let token: Token
      try {
        token = (yield call([apiClient, apiClient.login], {
          username,
          password,
        })) as Awaited<ReturnType<typeof apiClient.login>>
      } catch (error) {
        logger.error(error)
        alert(
          `Failed to log in to server ${url.toString()} as user ${username}:\n${(
            error as Error
          ).toString()}`,
        )
        return
      }

      yield call(SecureStore.setItemAsync, "st_token", token.access_token)

      yield put(
        authSlice.actions.loggedIn({
          accessToken: token.access_token,
          username,
        }),
      )

      if (action.type === loginButtonTapped.type) {
        yield call([router, router.push], "/")
      }
    },
  )
}

export function* hydrateAccessToken() {
  const storedToken = (yield call(
    SecureStore.getItemAsync,
    "st_token",
  )) as Awaited<ReturnType<typeof SecureStore.getItemAsync>>

  const credentialsString = (yield call(
    SecureStore.getItemAsync,
    "st_credentials",
  )) as Awaited<ReturnType<typeof SecureStore.getItemAsync>>

  if (!credentialsString) {
    yield put(authSlice.actions.accessTokenHydrationFailed())
    return
  }

  const { username, password } = JSON.parse(credentialsString) as {
    username: string
    password: string
  }

  const apiBaseUrl = (yield select(getApiBaseUrl)) as ReturnType<
    typeof getApiBaseUrl
  >

  if (!apiBaseUrl) {
    yield put(authSlice.actions.accessTokenHydrationFailed())
    return
  }
  const url = new URL(apiBaseUrl)

  const apiClient = new ApiClient(
    url.origin,
    url.pathname,
    storedToken ?? undefined,
  )

  if (storedToken) {
    try {
      const isValid = (yield call([
        apiClient,
        apiClient.validateToken,
      ])) as Awaited<ReturnType<typeof apiClient.validateToken>>

      if (isValid) {
        yield put(
          authSlice.actions.accessTokenHydrated({
            accessToken: storedToken,
            username,
          }),
        )
        return
      }
    } catch (_) {
      // pass
    }
  }

  yield put(loginCredentialsHydrated({ username, password }))
}

export function* logoutSaga() {
  yield takeEvery(
    [
      authSlice.actions.logoutButtonTapped,
      apiSlice.actions.changeServerButtonTapped,
    ],
    function* () {
      yield call(SecureStore.deleteItemAsync, "st_credentials")
      yield call(SecureStore.deleteItemAsync, "st_token")
    },
  )
}
