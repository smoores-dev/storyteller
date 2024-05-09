import AsyncStorage from "@react-native-async-storage/async-storage"
import { call, put, takeEvery } from "redux-saga/effects"
import { apiBaseUrlChanged, apiSlice } from "../slices/apiSlice"
import { router } from "expo-router"
import { ApiClient, ApiClientError } from "../../apiClient"
import { Generated } from "./bookshelfSagas"
import { logger } from "../../logger"
import { joinUrlPaths } from "../../urls"

/**
 * Determines whether to append /api to the base URL entered by the user,
 * based on whether the backend supports proxying to the API from the web
 * server.
 *
 * In v1, users must enter the URL for the API server directly. In v2,
 * users may enter the URL for the web server, which has an /api endpoint
 * that proxies requests to the API. To make the lives of users simpler,
 * if a user enters a URL without a path ending in /api, we check to see
 * whether their server supports proxying via /api and append that for them
 * if it does.
 *
 * @param baseUrlString The base URL inputted by the user
 * @returns The actual base URL for the API; depends on whether backend is v1 or v2+
 */
function* determineBaseUrl(baseUrlString: string) {
  const baseUrl = new URL(baseUrlString)

  if (baseUrl.pathname.endsWith("/api") || baseUrl.pathname.endsWith("/api/")) {
    return baseUrlString
  }

  baseUrl.pathname = joinUrlPaths(baseUrl.pathname, "/api")
  const apiClient = new ApiClient(baseUrl.origin, baseUrl.pathname)

  try {
    const helloWorld = (yield call([apiClient, apiClient.hello])) as Awaited<
      ReturnType<typeof apiClient.hello>
    >
    if (helloWorld["Hello"] === "World") {
      return baseUrl.toString()
    } else {
      return baseUrlString
    }
  } catch (error) {
    if (error instanceof ApiClientError && error.statusCode === 404) {
      return baseUrlString
    }
    logger.info(
      `Failed attempting to determine correct server base URL; using user provided input`,
    )
    logger.debug(error)
  }

  return baseUrlString
}

export function* serverUpdatedSaga() {
  yield takeEvery(apiBaseUrlChanged, function* (action) {
    const baseUrl = (yield call(
      determineBaseUrl,
      action.payload.baseUrl,
    )) as Generated<ReturnType<typeof determineBaseUrl>>
    yield put(apiSlice.actions.apiBaseUrlChangeCommitted({ baseUrl }))
  })
}

export function* serverUpdateCommittedSaga() {
  yield takeEvery(
    apiSlice.actions.apiBaseUrlChangeCommitted,
    function* (action) {
      yield call(
        AsyncStorage.setItem,
        "st_api_base_url",
        action.payload.baseUrl,
      )
      yield call([router, router.push], "/login")
    },
  )
}

export function* clearServerSaga() {
  yield takeEvery(apiSlice.actions.changeServerButtonTapped, function* () {
    yield call(AsyncStorage.removeItem, "st_api_base_url")
    yield call([router, router.push], "/server")
  })
}

export function* hydrateServer() {
  const apiBaseUrl = (yield call(
    AsyncStorage.getItem,
    "st_api_base_url",
  )) as Awaited<ReturnType<typeof AsyncStorage.getItem>>

  if (!apiBaseUrl) return

  yield put(apiSlice.actions.apiBaseUrlHydrated({ baseUrl: apiBaseUrl }))
}
