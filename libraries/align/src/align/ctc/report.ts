import { type Document, type ManifestItem } from "@storyteller-platform/epub"

import { type SentenceRange, type WordRange } from "../getSentenceRanges.ts"

export type AlignedChapter = {
  chapter: ManifestItem
  chunk?: number
  xml: Document
  sentenceRanges: SentenceRange[]
  wordRanges: WordRange[][]
  startOffset: number
  endOffset: number
}
