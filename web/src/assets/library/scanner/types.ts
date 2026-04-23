import { type Audiobook as AudiobookAsset } from "@storyteller-platform/audiobook"
import { type Epub } from "@storyteller-platform/epub"

import { type SerializedManifest } from "@/components/reader/types"
import {
  type BookRelationsUpdate,
  type BookUpdate,
  type BookWithRelations,
} from "@/database/books"
import { type UUID } from "@/uuid"

export type ScanFormat = "ebook" | "audiobook" | "readaloud" | "epub-unknown"

export type ResolvedScanFormat = Exclude<ScanFormat, "epub-unknown">
export type ResolvedEpubFormat = Extract<
  ResolvedScanFormat,
  "ebook" | "readaloud"
>
export type EpubScanFormat = Extract<
  ScanFormat,
  "ebook" | "readaloud" | "epub-unknown"
>

type ScanInputBase = {
  bookUuid: UUID
  filepath: string
  book: BookWithRelations
  isNew: boolean
  missing: boolean
  existingHash: string | null
}

export type EbookInput = ScanInputBase & { format: "ebook" }
export type ReadaloudInput = ScanInputBase & { format: "readaloud" }
export type AudiobookInput = ScanInputBase & { format: "audiobook" }
export type UnknownEpubInput = ScanInputBase & { format: "epub-unknown" }

export type ScanInput =
  | EbookInput
  | ReadaloudInput
  | AudiobookInput
  | UnknownEpubInput

export type Existing = ScanInput & { missing: false }

type HashedExtras = {
  fileHash: string
  fileSize: number | null
  changed: boolean
}

export type Hashed = Existing & HashedExtras
export type EpubHashed = (EbookInput | ReadaloudInput | UnknownEpubInput) & {
  missing: false
} & HashedExtras
export type AudiobookHashed = AudiobookInput & { missing: false } & HashedExtras

type EpubOpenedExtras = { isEpub2: false; epub: Epub }
type EpubNeedsUpgradeExtras = { isEpub2: true }

export type EpubOpened = EpubHashed & EpubOpenedExtras
export type EpubNeedsUpgrade = EpubHashed & EpubNeedsUpgradeExtras
export type EpubOpenState = EpubOpened | EpubNeedsUpgrade

export type FormatKnown = (EbookInput | ReadaloudInput) & {
  missing: false
} & HashedExtras &
  EpubOpenedExtras

export type AudiobookOpened = AudiobookHashed & { audiobook: AudiobookAsset }

type MetadataExtractedExtras = {
  extractedMetadata: BookUpdate | null
  extractedRelations: BookRelationsUpdate
}

export type EpubMetadataExtracted = FormatKnown & MetadataExtractedExtras
export type AudiobookMetadataExtracted = AudiobookOpened &
  MetadataExtractedExtras

export type MetadataExtracted =
  | EpubMetadataExtracted
  | AudiobookMetadataExtracted

type EbookManifestExtras = {
  manifest: SerializedManifest
  pageCount: number | null
  duration: null
}

type ReadaloudManifestExtras = {
  manifest: SerializedManifest
  pageCount: number | null
  duration: number | null
}

type AudiobookManifestExtras = {
  manifest: SerializedManifest
  pageCount: null
  duration: number | null
}

export type EbookManifestReady = EbookInput & {
  missing: false
} & HashedExtras &
  EpubOpenedExtras &
  MetadataExtractedExtras &
  EbookManifestExtras

export type ReadaloudManifestReady = ReadaloudInput & {
  missing: false
} & HashedExtras &
  EpubOpenedExtras &
  MetadataExtractedExtras &
  ReadaloudManifestExtras

export type AudiobookManifestReady = AudiobookInput & {
  missing: false
} & HashedExtras & {
    audiobook: AudiobookAsset
  } & MetadataExtractedExtras &
  AudiobookManifestExtras

export type ManifestReady =
  | EbookManifestReady
  | ReadaloudManifestReady
  | AudiobookManifestReady

export type Reconciled = ManifestReady & { book: BookWithRelations }

export function isResolvedFormat(
  format: ScanFormat,
): format is ResolvedScanFormat {
  return format !== "epub-unknown"
}

export function isEpubFormat(format: ScanFormat): format is EpubScanFormat {
  return format !== "audiobook"
}

export function isResolvedEpubFormat(
  format: ScanFormat,
): format is ResolvedEpubFormat {
  return format === "ebook" || format === "readaloud"
}
