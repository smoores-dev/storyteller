import { type Audiobook as AudiobookAsset } from "@storyteller-platform/audiobook"
import { type EpubMetadataReader } from "@storyteller-platform/epub"

import { type StatEntry } from "@/assets/library/fingerprint"
import { type SerializedManifest } from "@/components/reader/types"
import {
  type BookRelationsUpdate,
  type BookUpdate,
  type BookWithRelations,
} from "@/database/books"
import { type UUID } from "@/uuid"

export type ScanFormat = "ebook" | "audiobook" | "readaloud"

/**
 * thing to be scanned, either exists already in the db or is a new candidate
 */
export type Candidate = {
  folder: string
  format: ScanFormat
  filepath: string
  isReadaloud?: boolean
  /**
   * used for uploads, which uuid the book should be created with
   */
  bookUuidHint?: UUID
  existingBook?: BookWithRelations
  /**
   * which collections newly created books should be added to, through association with import rules
   */
  collections?: UUID[]
  /**
   * marks candidates that are triggered from watchers, makes sure that candidates from the same folder are processed together and end up as one book.
   * does not apply to eg manual uploads/imports
   */
  groupable?: boolean
}

export type EpubScanFormat = Extract<ScanFormat, "ebook" | "readaloud">

type ScanInputBase = {
  bookUuid: UUID
  filepath: string
  book: BookWithRelations
  isNew: boolean
  missing: boolean
  existingFingerprint: string | null
  /**
   * True for inputs synthesized from discovery's epubUnknown list.
   * The pipeline starts these as "ebook" and may flip to "readaloud"
   * after determine-format inspects media overlays. Until that step
   * runs, no DB writes touch the format relation.
   */
  formatTentative?: boolean
}

export type EbookInput = ScanInputBase & { format: "ebook" }
export type ReadaloudInput = ScanInputBase & { format: "readaloud" }
export type AudiobookInput = ScanInputBase & { format: "audiobook" }

export type ScanInput = EbookInput | ReadaloudInput | AudiobookInput

export type Existing = ScanInput & { missing: false }

type FingerprintedExtras = {
  fingerprint: string
  fileSize: number | null
  changed: boolean
  statEntries: StatEntry[]
}

export type Fingerprinted = Existing & FingerprintedExtras

export type EpubFingerprinted = (EbookInput | ReadaloudInput) & {
  missing: false
} & FingerprintedExtras

export type AudiobookFingerprinted = AudiobookInput & {
  missing: false
} & FingerprintedExtras

export type EpubOpened = EpubFingerprinted & {
  isEpub2: false
  epub: EpubMetadataReader
}
export type EpubNeedsUpgrade = EpubFingerprinted & { isEpub2: true }

export type EpubOpenState = EpubOpened | EpubNeedsUpgrade

export type FormatKnown = (EbookInput | ReadaloudInput) & {
  missing: false
} & FingerprintedExtras & { isEpub2: false; epub: EpubMetadataReader }

export type AudiobookOpened = AudiobookFingerprinted & {
  audiobook: AudiobookAsset
}

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
} & FingerprintedExtras & {
    isEpub2: false
    epub: EpubMetadataReader
  } & MetadataExtractedExtras &
  EbookManifestExtras

export type ReadaloudManifestReady = ReadaloudInput & {
  missing: false
} & FingerprintedExtras & {
    isEpub2: false
    epub: EpubMetadataReader
  } & MetadataExtractedExtras &
  ReadaloudManifestExtras

export type AudiobookManifestReady = AudiobookInput & {
  missing: false
} & FingerprintedExtras & {
    audiobook: AudiobookAsset
  } & MetadataExtractedExtras &
  AudiobookManifestExtras

export type ManifestReady =
  | EbookManifestReady
  | ReadaloudManifestReady
  | AudiobookManifestReady

export type Reconciled = ManifestReady & { book: BookWithRelations }

export function isEpubFormat(format: ScanFormat): format is EpubScanFormat {
  return format !== "audiobook"
}
