import {
  type AudiobookOpened,
  type FormatKnown,
} from "@/assets/library/scanner/types"
import {
  getMetadataFromAudiobook,
  getMetadataFromEpub,
} from "@/assets/metadata"
import { type BookRelationsUpdate, type BookUpdate } from "@/database/books"

type MetadataExtras = {
  extractedMetadata: BookUpdate | null
  extractedRelations: BookRelationsUpdate
}

export async function extractEpubMetadata<T extends FormatKnown>(
  input: T,
): Promise<T & MetadataExtras> {
  const { update, relations } = await getMetadataFromEpub(input.epub)
  return { ...input, extractedMetadata: update, extractedRelations: relations }
}

export async function extractAudiobookMetadata<T extends AudiobookOpened>(
  input: T,
): Promise<T & MetadataExtras> {
  const { update, relations } = await getMetadataFromAudiobook(input.audiobook)
  return { ...input, extractedMetadata: update, extractedRelations: relations }
}
