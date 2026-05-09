import { cacheAudioCover, cacheTextCover } from "@/assets/library/coverCache"
import { defineStep } from "@/assets/library/scanner/step2"
import { type Reconciled } from "@/assets/library/scanner/types"

export type ExtractTextCoverInput = Reconciled & {
  format: "ebook" | "readaloud"
}

export type ExtractAudiobookCoverInput = Reconciled & { format: "audiobook" }

export const extractTextCoverStep = defineStep(
  "extract-text-cover",
  async <T extends ExtractTextCoverInput>(input: T, _ctx) => {
    await cacheTextCover(input.book)
    return input
  },
)

export const extractAudiobookCoverStep = defineStep(
  "extract-audiobook-cover",
  async (input: ExtractAudiobookCoverInput, _ctx) => {
    await cacheAudioCover(input.book)
    return input
  },
)
