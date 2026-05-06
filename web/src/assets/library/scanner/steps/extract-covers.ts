import { cacheAudioCover, cacheTextCover } from "@/assets/library/coverCache"
import { createStep } from "@/assets/library/scanner/step"
import { type Reconciled } from "@/assets/library/scanner/types"

export type ExtractTextCoverInput = Reconciled & {
  format: "ebook" | "readaloud"
}

export type ExtractAudiobookCoverInput = Reconciled & { format: "audiobook" }

export const extractTextCoverStep = createStep<
  ExtractTextCoverInput,
  Reconciled
>("extract-text-cover", async (input) => {
  await cacheTextCover(input.book)
  return input
})

export const extractAudiobookCoverStep = createStep<
  ExtractAudiobookCoverInput,
  Reconciled
>("extract-audiobook-cover", async (input) => {
  await cacheAudioCover(input.book)
  return input
})
