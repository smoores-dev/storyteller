import { createSlice } from "@reduxjs/toolkit"
import { logger } from "../../logger"

type LoggingSliceState = {
  debugEnabled: boolean
}

const initialState: LoggingSliceState = {
  debugEnabled: logger.getSeverity() === "debug",
}

export const loggingSlice = createSlice({
  name: "logging",
  initialState,
  reducers: {
    debugLoggingToggled(state) {
      state.debugEnabled = !state.debugEnabled
    },
  },
})
