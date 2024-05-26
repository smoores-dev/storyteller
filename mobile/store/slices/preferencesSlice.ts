import { PayloadAction, createSlice } from "@reduxjs/toolkit"

export type PreferencesState = {
  darkMode: boolean | "auto"
}

const initialState: PreferencesState = {
  darkMode: "auto",
}

export const preferencesSlice = createSlice({
  name: "preferences",
  initialState,
  reducers: {
    preferencesHydrated(_state, action: PayloadAction<PreferencesState>) {
      return action.payload
    },
    preferencesUpdated(
      state,
      action: PayloadAction<Partial<PreferencesState>>,
    ) {
      return { ...state, ...action.payload }
    },
  },
})
