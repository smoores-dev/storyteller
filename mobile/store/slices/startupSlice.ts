import { createSlice } from "@reduxjs/toolkit"

export enum StartupStatus {
  INITIAL = "INITIAL",
  HYDRATING = "HYDRATING",
  HYDRATED = "HYDRATED",
  IN_ERROR = "IN_ERROR",
}

export type StartupState = {
  startupStatus: StartupStatus
}

const initialState: StartupState = {
  startupStatus: StartupStatus.INITIAL,
}

export const startupSlice = createSlice({
  name: "startup",
  initialState,
  reducers: {
    startupHydrationStarted(state) {
      state.startupStatus = StartupStatus.HYDRATING
    },
    startupHydrationCompleted(state) {
      state.startupStatus = StartupStatus.HYDRATED
    },
    startupHydrationRejected(state) {
      state.startupStatus = StartupStatus.IN_ERROR
    },
  },
})
