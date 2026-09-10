import { type ManifestItem, type ParsedXml } from "@storyteller-platform/epub"

import { type SentenceRange, type WordRange } from "../getSentenceRanges.ts"

export type AlignedChapter = {
  chapter: ManifestItem
  chunk?: number
  xml: ParsedXml
  sentenceRanges: SentenceRange[]
  wordRanges: WordRange[][]
  startOffset: number
  endOffset: number
}
