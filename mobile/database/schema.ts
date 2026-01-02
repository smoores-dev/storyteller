import { type ColumnType } from "kysely"

import { type HighlightTint } from "@/colors"
import {
  type ReadiumLocator,
  type ReadiumManifest,
} from "@/modules/readium/src/Readium.types"
import { type UUID } from "@/uuid"

export type Generated<T> =
  T extends ColumnType<infer S, infer I, infer U>
    ? ColumnType<S, I | undefined, U>
    : ColumnType<T, T | undefined, T>

export interface AudiobookResource {
  href: string
  title: string | null
  type: string
  duration: number
  bitrate: number | null
}

export interface Audiobook {
  bookUuid: UUID
  manifest: ReadiumManifest | null
  downloadStatus: Generated<
    "NONE" | "PAUSED" | "DOWNLOADING" | "ERROR" | "DOWNLOADED" | "QUEUED"
  >
  downloadProgress: Generated<number>
  downloadQueuePosition: Generated<number>
  createdAt: Generated<string>
  updatedAt: Generated<string>
  uuid: UUID
}

export interface Book {
  alignedAt: string | null
  alignedByStorytellerVersion: string | null
  alignedWith: string | null
  createdAt: Generated<string>
  description: string | null
  id: number | null
  language: Generated<string | null>
  publicationDate: string | null
  rating: number | null
  subtitle: string | null
  suffix: Generated<string>
  title: string
  serverUuid: UUID | null
  ebookCoverUrl: string | null
  audiobookCoverUrl: string | null
  updatedAt: Generated<string>
  uuid: UUID
}

export interface Bookmark {
  uuid: UUID
  bookUuid: UUID
  locator: ReadiumLocator
  createdAt: Generated<string>
  updatedAt: Generated<string>
}

export interface BookPreferences {
  uuid: UUID
  bookUuid: UUID
  name: keyof import("@/database/preferencesTypes").BookPreferences
  value: string
  createdAt: Generated<string>
  updatedAt: Generated<string>
}

export interface BookToCollection {
  bookUuid: UUID
  collectionUuid: UUID
  createdAt: Generated<string>
  updatedAt: Generated<string>
  uuid: UUID
}

export interface BookToCreator {
  bookUuid: UUID
  createdAt: Generated<string>
  creatorUuid: UUID
  role:
    | import("@storyteller-platform/web/src/components/books/edit/marcRelators").Role
    | null
  updatedAt: Generated<string>
  uuid: UUID
}

export interface BookToSeries {
  bookUuid: UUID
  createdAt: Generated<string>
  featured: Generated<"true" | "false">
  position: number | null
  seriesUuid: UUID
  updatedAt: Generated<string>
  uuid: UUID
}

export interface BookToStatus {
  bookUuid: UUID
  createdAt: Generated<string>
  statusUuid: UUID
  updatedAt: Generated<string>
  dirty: Generated<"true" | "false">
  uuid: Generated<UUID>
}

export interface BookToTag {
  bookUuid: UUID
  createdAt: Generated<string>
  tagUuid: UUID
  updatedAt: Generated<string>
  uuid: UUID
}

export interface Collection {
  createdAt: Generated<string>
  description: string | null
  name: string
  public: Generated<"true" | "false">
  serverUuid: UUID | null
  updatedAt: Generated<string>
  uuid: UUID
}

export interface Creator {
  createdAt: Generated<string>
  fileAs: string
  name: string
  serverUuid: UUID | null
  updatedAt: Generated<string>
  uuid: UUID
}

export interface Ebook {
  bookUuid: UUID
  downloadStatus: Generated<
    "NONE" | "PAUSED" | "DOWNLOADING" | "ERROR" | "DOWNLOADED" | "QUEUED"
  >
  downloadProgress: Generated<number>
  downloadQueuePosition: Generated<number>
  manifest: ReadiumManifest | null
  positions: ReadiumLocator[] | null
  createdAt: Generated<string>
  updatedAt: Generated<string>
  uuid: UUID
}

export interface Highlight {
  uuid: UUID
  bookUuid: UUID
  color: HighlightTint
  locator: ReadiumLocator
  createdAt: Generated<string>
  updatedAt: Generated<string>
}

export interface Position {
  createdAt: Generated<string>
  locator: ReadiumLocator
  timestamp: number
  bookUuid: UUID
  updatedAt: Generated<string>
  uuid: UUID
}

export interface Readaloud {
  bookUuid: UUID
  downloadStatus: Generated<
    "NONE" | "PAUSED" | "DOWNLOADING" | "ERROR" | "DOWNLOADED" | "QUEUED"
  >
  downloadProgress: Generated<number>
  downloadQueuePosition: Generated<number>
  audioManifest: ReadiumManifest | null
  epubManifest: ReadiumManifest | null
  positions: ReadiumLocator[] | null
  createdAt: Generated<string>
  status: Generated<
    "CREATED" | "QUEUED" | "PROCESSING" | "STOPPED" | "ERROR" | "ALIGNED"
  >
  updatedAt: Generated<string>
  uuid: UUID
}

export interface Series {
  createdAt: Generated<string>
  name: string
  serverUuid: UUID | null
  updatedAt: Generated<string>
  uuid: UUID
}

export interface Server {
  createdAt: Generated<string>
  name: Generated<string | null>
  baseUrl: string
  username: Generated<string | null>
  updatedAt: Generated<string>
  uuid: UUID
}

export interface Preferences {
  createdAt: Generated<string>
  id: number | null
  name: keyof import("@/database/preferencesTypes").Preferences
  updatedAt: Generated<string>
  uuid: UUID
  value: string
}

export interface Status {
  createdAt: Generated<string>
  isDefault: Generated<"true" | "false">
  name: string
  updatedAt: Generated<string>
  uuid: UUID
}

export interface Tag {
  createdAt: Generated<string>
  name: string
  serverUuid: UUID | null
  updatedAt: Generated<string>
  uuid: UUID
}

export interface DB {
  audiobook: Audiobook
  book: Book
  bookmark: Bookmark
  bookPreferences: BookPreferences
  bookToCollection: BookToCollection
  bookToCreator: BookToCreator
  bookToSeries: BookToSeries
  bookToStatus: BookToStatus
  bookToTag: BookToTag
  collection: Collection
  creator: Creator
  ebook: Ebook
  highlight: Highlight
  position: Position
  preferences: Preferences
  readaloud: Readaloud
  series: Series
  server: Server
  status: Status
  tag: Tag
}
