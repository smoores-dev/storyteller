import { createSelector } from "@reduxjs/toolkit"
import { RootState } from "../appState"
import { getAccessToken } from "./authSelectors"
import { ApiClient } from "../../apiClient"

export function getApiBaseUrl(state: RootState) {
  return state.api.baseUrl
}

export const getApiClient = createSelector(
  getApiBaseUrl,
  getAccessToken,
  (baseUrl, accessToken) => {
    if (baseUrl === null) return null
    const url = new URL(baseUrl)
    return new ApiClient(url.origin, url.pathname, accessToken ?? undefined)
  },
)
