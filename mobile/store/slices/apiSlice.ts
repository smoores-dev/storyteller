import { PayloadAction, createAction, createSlice } from "@reduxjs/toolkit"

export enum NetworkStatus {
  ONLINE = "ONLINE",
  OFFLINE = "OFFLINE",
  UNKNOWN = "UNKNOWN",
}

export type ApiState = {
  baseUrl: string | null
  networkStatus: NetworkStatus
}

const initialState: ApiState = {
  baseUrl: null,
  networkStatus: NetworkStatus.UNKNOWN,
}

export const apiBaseUrlChanged = createAction(
  "api/apiBaseUrlChanged",
  ({ baseUrl }: { baseUrl: string }) => ({ payload: { baseUrl } }),
)

export const apiSlice = createSlice({
  name: "api",
  initialState,
  reducers: {
    apiCameOnline(state) {
      state.networkStatus = NetworkStatus.ONLINE
    },
    apiWentOffline(state) {
      state.networkStatus = NetworkStatus.OFFLINE
    },
    apiBaseUrlChangeCommitted(
      state,
      action: PayloadAction<{ baseUrl: string }>,
    ) {
      const { baseUrl } = action.payload

      state.baseUrl = baseUrl
    },
    apiBaseUrlHydrated(state, action: PayloadAction<{ baseUrl: string }>) {
      const { baseUrl } = action.payload

      state.baseUrl = baseUrl
    },
    changeServerButtonTapped(state) {
      state.baseUrl = null
      state.networkStatus = NetworkStatus.UNKNOWN
    },
  },
})
