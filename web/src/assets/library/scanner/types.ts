import { type BookWithRelations } from "@/database/books"
import { type UUID } from "@/uuid"

export type ScanFormat = "ebook" | "audiobook" | "readaloud"

/**
 * potential book file to be scanned
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

export type ScanInputBase = {
  bookUuid: UUID
  filepath: string
  book: BookWithRelations
  isNew: boolean
  missing: boolean
  existingFingerprint: string | null
}

export type EbookInput = ScanInputBase & { format: "ebook" }
export type ReadaloudInput = ScanInputBase & { format: "readaloud" }
export type AudiobookInput = ScanInputBase & { format: "audiobook" }

export type ScanInput = EbookInput | ReadaloudInput | AudiobookInput
