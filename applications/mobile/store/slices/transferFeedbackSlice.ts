import { type PayloadAction, createSlice } from "@reduxjs/toolkit"

export const BOOK_IMPORT_STAGES = [
  "copying",
  "extracting",
  "parsing",
  "saving",
] as const

export type BookImportStage = (typeof BOOK_IMPORT_STAGES)[number]

export type TransferFeedbackState = {
  importStage: BookImportStage | null
  failure: string | null
}

const initialState: TransferFeedbackState = {
  importStage: null,
  failure: null,
}

export const transferFeedbackSlice = createSlice({
  name: "transferFeedback",
  initialState,
  reducers: {
    bookImportStageChanged(state, action: PayloadAction<BookImportStage>) {
      state.importStage = action.payload
    },
    bookImportSettled(state) {
      state.importStage = null
    },
    bookTransferFailed(state, action: PayloadAction<string>) {
      state.failure = action.payload
    },
    bookTransferFailureDismissed(state) {
      state.failure = null
    },
  },
})
