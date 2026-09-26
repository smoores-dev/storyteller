import assert from "node:assert/strict"
import { test } from "vitest"

import {
  transferFeedbackSlice,
  type TransferFeedbackState,
} from "./transferFeedbackSlice"

const {
  bookImportStageChanged,
  bookImportSettled,
  bookTransferFailed,
  bookTransferFailureDismissed,
} = transferFeedbackSlice.actions

const initial = transferFeedbackSlice.getInitialState()

const stateWith = (state: Partial<TransferFeedbackState>) => ({
  ...initial,
  ...state,
})

test("tracks the stage of an in-flight import", () => {
  const copying = transferFeedbackSlice.reducer(
    initial,
    bookImportStageChanged("copying"),
  )
  assert.equal(copying.importStage, "copying")

  const extracting = transferFeedbackSlice.reducer(
    copying,
    bookImportStageChanged("extracting"),
  )
  assert.equal(extracting.importStage, "extracting")
})

test("clears the import stage once the import settles", () => {
  const saving = stateWith({ importStage: "saving" })

  assert.equal(
    transferFeedbackSlice.reducer(saving, bookImportSettled()).importStage,
    null,
  )
})

test("keeps the most recent failure", () => {
  const first = transferFeedbackSlice.reducer(
    initial,
    bookTransferFailed("Failed to import book: bad epub"),
  )
  const second = transferFeedbackSlice.reducer(
    first,
    bookTransferFailed("Failed to download ebook: unauthorized"),
  )

  assert.equal(second.failure, "Failed to download ebook: unauthorized")
})

test("dismisses a failure without touching the import stage", () => {
  const failing = stateWith({
    importStage: "parsing",
    failure: "Failed to download audiobook: not found",
  })

  const dismissed = transferFeedbackSlice.reducer(
    failing,
    bookTransferFailureDismissed(),
  )

  assert.equal(dismissed.failure, null)
  assert.equal(dismissed.importStage, "parsing")
})
