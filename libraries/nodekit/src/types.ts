// keep this module free of node imports so eg metadata providers can be pulled into client

export const METADATA_PROVIDERS = ["audnexus", "hardcover"] as const
export type BookMetadataProvider = (typeof METADATA_PROVIDERS)[number]

export const COVER_PROVIDERS = ["apple", "hardcover"] as const
export type CoverProvider = (typeof COVER_PROVIDERS)[number]

export interface MetadataSearchQuery {
  providers?: BookMetadataProvider[]
  provider?: BookMetadataProvider
  title?: string
  author?: string
  query?: string
  region?: string
}

export interface MetadataBookQuery {
  provider: BookMetadataProvider
  id: string
  region?: string
}

export interface CoverSearchQuery {
  providers?: CoverProvider[]
  provider?: CoverProvider
  title?: string
  author?: string
  query?: string
}

export interface CoverDownloadQuery {
  url: string
  provider?: CoverProvider
  filename?: string
}

export interface ConfigureOptions {
  tokens?: Record<string, string>
}

export interface BookMetadataSearchResult {
  provider: BookMetadataProvider
  id: string
  title: string
  subtitle?: string
  authors: string[]
  narrators: string[]
  seriesName?: string
  seriesPosition?: string | number
  releaseDate?: string
  releaseYear?: number
  imageUrl?: string
}

export interface MetadataContributor {
  name: string
  role: string
}

export interface MetadataSeries {
  name: string
  position?: string | number
  featured?: boolean
}

export const HARDCOVER_TAG_CATEGORIES = [
  "Genre",
  "Mood",
  "Pace",
  "Tag",
  "Content Warning",
] as const
export type HardcoverTagCategory = (typeof HARDCOVER_TAG_CATEGORIES)[number]

export const AUDNEXUS_TAG_CATEGORIES = ["genre", "tag"] as const
export type AudnexusTagCategory = (typeof AUDNEXUS_TAG_CATEGORIES)[number]

export interface MetadataTag<Provider extends BookMetadataProvider> {
  name: string
  /**
   * "Genre", "Mood", "Pace", "Tag", "Content Warning" on hardcover;
   * "genre" / "tag" on audnexus
   */
  category?: Provider extends "hardcover"
    ? HardcoverTagCategory
    : AudnexusTagCategory
  /**
   * hardcover vote count; 0 on audnexus
   */
  count?: number
}

export interface MetadataEdition {
  id: string
  format: string
  editionInfo?: string
  title?: string
  subtitle?: string
  isbn13?: string
  isbn10?: string
  asin?: string
  pages?: number
  audioSeconds?: number
  releaseDate?: string
  language?: string
  country?: string
  publisher?: string
  narrators: string[]
  otherContributors: MetadataContributor[]
  imageUrl?: string
  imageWidth?: number
  imageHeight?: number
}

export type BookMetadataCandidate<
  Provider extends BookMetadataProvider = BookMetadataProvider,
> = Provider extends Provider
  ? {
      provider: Provider
      id?: string
      slug?: string
      title: string
      subtitle?: string
      description?: string
      publisher?: string
      releaseDate?: string
      rating?: number
      language?: string
      authors: string[]
      narrators: string[]
      creators: MetadataContributor[]
      series: MetadataSeries[]
      tags: MetadataTag<Provider>[]
      editions?: MetadataEdition[]
      defaultAudioEdition?: MetadataEdition
      imageUrl?: string
      imageWidth?: number
      imageHeight?: number
    }
  : never

export interface CoverCandidate {
  id: string
  provider: CoverProvider
  mediaKind: "audiobook" | "ebook"
  url: string
  title?: string
  subtitle?: string
  format?: string
  language?: string
  width?: number
  height?: number
}

export interface DownloadResult {
  filename: string
  contentType: string
  url: string
  width: number
  height: number
  bytes: Buffer
}

export type ProviderTokenSource = "database" | "env"

export type ProviderTokenStatus = {
  provider: BookMetadataProvider
  tokenSet: boolean
  source: ProviderTokenSource | null
  // set when a saved token no longer decrypts (the instance secret key
  // changed); the token must be entered again
  unreadable: boolean
}

export type MetadataProvidersResponse = {
  // whether the native addon could be loaded on this server
  available: boolean
  providers: ProviderTokenStatus[]
}
