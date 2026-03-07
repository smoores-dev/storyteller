import {
  type Layout,
  type Profile,
  type ReadingProgression,
} from "@readium/shared"

export type SerializedSubject = {
  name: SerializedLocalizedString
  /** Provides a string that a machine can sort. */
  sortAs?: string
  /** EPUB 3.1 opf:term. */
  code?: string
  /** EPUB 3.1 opf:authority. */
  scheme?: string
  /** PUsed to retrieve similar publications for the given subjects. */
  links?: SerializedLinks
}

export type SerializedLocalizedString =
  | {
      translations: {
        [key: string]: string
      }
    }
  | string
export type SerializedAccessibility = {
  /**
   * An established standard to which the described resource conforms.
   */
  conformsTo: unknown[]
  /**
   * Certification of accessible publications.
   */
  certification: unknown
  /**
   * A human-readable summary of specific accessibility features or deficiencies.
   */
  summary: unknown
  /**
   * The human sensory perceptual system through which a person may process or perceive information.
   */
  accessMode: unknown[]
  /**
   * A list of single or combined accessModes that are sufficient to understand all the intellectual content.
   */
  accessModeSufficient: unknown[]
  /**
   * Content features of the resource.
   */
  feature: unknown[]
  /**
   * A characteristic of the described resource that is physiologically dangerous to some users.
   */
  hazard: unknown[]
}

export type SerializedLink = {
  href: string
  templated?: boolean
  type?: string
  title?: string
  rels?: string[]
  properties?: {
    [key: string]: unknown
  }
  height?: number
  width?: number
  size?: number
  duration?: number
  bitrate?: number
  languages?: string[]
  alternates?: SerializedLink[]
  children?: SerializedLink[]
}

export type SerializedLinks = SerializedLink[]

export type SerializedContributor = {
  /** The name of the contributor. */
  readonly name: SerializedLocalizedString
  /** The string used to sort the name of the contributor. */
  readonly sortAs?: string
  /** An unambiguous reference to this contributor. */
  readonly identifier?: string
  /** Alternate identifiers for this contributor. */
  readonly altIdentifiers?: SerializedAltIdentifier[]
  /** The role of the contributor in the publication making. */
  readonly roles?: string[]
  /** Used to retrieve similar publications for the given contributor. */
  readonly links?: SerializedLinks
  /** The position of the publication in this collection/series, when the contributor represents a collection. */
  readonly position?: number
}

export type Subject = {
  readonly name: SerializedLocalizedString
  /** Provides a string that a machine can sort. */
  readonly sortAs?: string
  /** EPUB 3.1 opf:term. */
  readonly code?: string
  /** EPUB 3.1 opf:authority. */
  readonly scheme?: string
  /** PUsed to retrieve similar publications for the given subjects. */
  readonly links?: SerializedLinks
}

export type SerializedAltIdentifier = {
  value: string
  scheme?: string
}

export type SerializedMetadata = {
  title: string | SerializedLocalizedString
  typeUri?: string
  conformsTo?: Array<Profile>
  identifier?: string
  altIdentifier?: SerializedAltIdentifier
  subtitle?: string | SerializedLocalizedString
  sortAs?: string
  artists?: SerializedContributor[]
  authors?: SerializedContributor[]
  colorists?: SerializedContributor[]
  contributors?: SerializedContributor[]
  editors?: SerializedContributor[]
  illustrators?: SerializedContributor[]
  inkers?: SerializedContributor[]
  letterers?: SerializedContributor[]
  narrators?: SerializedContributor[]
  pencilers?: SerializedContributor[]
  translators?: SerializedContributor[]
  languages?: Array<string>
  description?: string | SerializedLocalizedString
  publishers?: SerializedContributor[]
  imprints?: SerializedContributor[]
  published?: string
  modified?: string
  subjects?: SerializedSubject[]
  // ?
  belongsTo?: SerializedContributor[]
  belongsToCollections?: SerializedContributor[]
  belongsToSeries?: SerializedContributor[]
  layout?: Layout
  readingProgression?: ReadingProgression
  duration?: number
  numberOfPages?: number
  accessibility?: SerializedAccessibility
  tdm?: {
    /**
     * Indicates whether the publication allows text and data mining.
     */
    reservation?: "all" | "none"
    /**
     * Additional policy information about text and data mining usage.
     */
    policy?: string
  }
  otherMetadata?: {
    [key: string]: unknown
  }
}
export type SerializedManifest = {
  readonly context?: Array<string>
  readonly metadata: SerializedMetadata
  readonly links: SerializedLinks
  /** Identifies a list of resources in reading order for the publication. */
  readonly readingOrder: SerializedLinks
  /** Identifies resources that are necessary for rendering the publication. */
  readonly resources?: SerializedLinks
  /** Identifies the collection that contains a table of contents. */
  readonly toc?: SerializedLinks
}
