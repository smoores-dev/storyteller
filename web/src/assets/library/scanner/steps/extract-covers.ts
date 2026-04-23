import { cacheAudioCover, cacheTextCover } from "@/assets/library/coverCache"
import { type Reconciled } from "@/assets/library/scanner/types"

export async function extractTextCover(
  input: Reconciled & { format: "ebook" | "readaloud" },
): Promise<void> {
  await cacheTextCover(input.book)
}

export async function extractAudiobookCover(
  input: Reconciled & { format: "audiobook" },
): Promise<void> {
  await cacheAudioCover(input.book)
}
