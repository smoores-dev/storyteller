import { createStep } from "@/assets/library/scanner/step"
import {
  type AudiobookMetadataExtracted,
  type AudiobookOpened,
  type EpubMetadataExtracted,
  type FormatKnown,
} from "@/assets/library/scanner/types"
import {
  getMetadataFromAudiobook,
  getMetadataFromEpub,
} from "@/assets/metadata"

export type ExtractEpubMetadataInput = FormatKnown
export type ExtractEpubMetadataOutput = EpubMetadataExtracted

export type ExtractAudiobookMetadataInput = AudiobookOpened
export type ExtractAudiobookMetadataOutput = AudiobookMetadataExtracted

export const extractEpubMetadataStep = createStep<
  ExtractEpubMetadataInput,
  ExtractEpubMetadataOutput
>("extract-epub-metadata", async (input) => {
  const { update, relations } = await getMetadataFromEpub(input.epub)
  return { ...input, extractedMetadata: update, extractedRelations: relations }
})

export const extractAudiobookMetadataStep = createStep<
  ExtractAudiobookMetadataInput,
  ExtractAudiobookMetadataOutput
>("extract-audiobook-metadata", async (input) => {
  const { update, relations } = await getMetadataFromAudiobook(input.audiobook)
  return { ...input, extractedMetadata: update, extractedRelations: relations }
})
