// generated using json-schema-to-typescript from https://github.com/readium/webpub-manifest/blob/379522e/schema/webpub-manifest.schema.json

export type ReadiumWebPublicationManifest = EPUBExtensionSubCollections & {
  "@context"?: string | string[]
  metadata: Metadata
  links?: Link[]
  /**
   * All resources listed in the reading order must contain a media type.
   */
  readingOrder: (Link & {
    /**
     * MIME type of the linked resource
     */
    type: string
    [k: string]: unknown
  })[]
  /**
   * All resources listed in the publication must contain a media type.
   */
  resources?: (Link & {
    /**
     * MIME type of the linked resource
     */
    type: string
    [k: string]: unknown
  })[]
  toc?: Link[]
  [k: string]: unknown
}
export type Metadata = EPUBProfileMetadata & {
  "@type"?: string
  conformsTo?: string | string[]
  title: LanguageMap
  sortAs?: LanguageMap
  subtitle?: LanguageMap
  identifier?: string
  altIdentifier?: AlternateIdentifiers
  accessibility?: AccessibilityObject
  modified?: string
  published?: {
    [k: string]: unknown
  } & string
  /**
   * The language must be a valid BCP 47 tag.
   */
  language?: string | string[]
  author?: Contributor
  translator?: Contributor
  editor?: Contributor
  artist?: Contributor
  illustrator?: Contributor
  letterer?: Contributor
  penciler?: Contributor
  colorist?: Contributor
  inker?: Contributor
  narrator?: Contributor
  contributor?: Contributor
  publisher?: Contributor
  imprint?: Contributor
  subject?: Subject
  /**
   * Hints how the layout of the publication should be presented
   */
  layout?: "fixed" | "reflowable" | "scrolled"
  readingProgression?: "rtl" | "ltr"
  description?: string
  duration?: number
  numberOfPages?: number
  belongsTo?: {
    collection?: Collection
    journal?: Periodical
    magazine?: Periodical
    newspaper?: Periodical
    periodical?: Periodical
    season?: Season
    series?: Series
    storyArc?: StoryArc
    volume?: Volume
    [k: string]: unknown
  }
  contains?: {
    article?: Article
    chapter?: Chapter
    episode?: Episode
    issue?: Issue
    season?: Season
    series?: Series
    storyArc?: StoryArc
    volume?: Volume
    [k: string]: unknown
  }
  tdm?: {
    reservation: "all" | "none"
    policy?: string
    [k: string]: unknown
  }
  [k: string]: unknown
}
export type LanguageMap =
  | string
  | {
      /**
       * This interface was referenced by `undefined`'s JSON-Schema definition
       * via the `patternProperty` "^((?<grandfathered>(en-GB-oed|i-ami|i-bnn|i-default|i-enochian|i-hak|i-klingon|i-lux|i-mingo|i-navajo|i-pwn|i-tao|i-tay|i-tsu|sgn-BE-FR|sgn-BE-NL|sgn-CH-DE)|(art-lojban|cel-gaulish|no-bok|no-nyn|zh-guoyu|zh-hakka|zh-min|zh-min-nan|zh-xiang))|((?<language>([A-Za-z]{2,3}(-(?<extlang>[A-Za-z]{3}(-[A-Za-z]{3}){0,2}))?)|[A-Za-z]{4}|[A-Za-z]{5,8})(-(?<script>[A-Za-z]{4}))?(-(?<region>[A-Za-z]{2}|[0-9]{3}))?(-(?<variant>[A-Za-z0-9]{5,8}|[0-9][A-Za-z0-9]{3}))*(-(?<extension>[0-9A-WY-Za-wy-z](-[A-Za-z0-9]{2,8})+))*(-(?<privateUse>x(-[A-Za-z0-9]{1,8})+))?)|(?<privateUse2>x(-[A-Za-z0-9]{1,8})+))$".
       */
      [k: string]: string
    }
/**
 * @minItems 1
 */
export type AlternateIdentifiers = [
  (
    | string
    | {
        value: string
        scheme?: string
        [k: string]: unknown
      }
  ),
  ...(
    | string
    | {
        value: string
        scheme?: string
        [k: string]: unknown
      }
  )[],
]
export type Contributor =
  | string
  | (string | ContributorObject)[]
  | ContributorObject
export type Subject = string | (string | SubjectObject)[] | SubjectObject
export type Collection =
  | string
  | (string | CollectionObject)[]
  | CollectionObject
export type Periodical =
  | string
  | (string | PeriodicalObject)[]
  | PeriodicalObject
export type Issue = number | (number | IssueObject)[] | IssueObject
export type Article = string | (string | ArticleObject)[] | ArticleObject
export type Chapter = number | (number | ChapterObject)[] | ChapterObject
export type Series = string | (string | SeriesObject)[] | SeriesObject
export type Episode = number | (number | EpisodeObject)[] | EpisodeObject
export type Season = number | (number | SeasonObject)[] | SeasonObject
export type StoryArc = number | (number | StoryArcObject)[] | StoryArcObject
export type Volume = number | (number | VolumeObject)[] | VolumeObject

export interface EPUBExtensionSubCollections {
  pageList?: Link[]
  landmarks?: Link[]
  loa?: Link[]
  loi?: Link[]
  lot?: Link[]
  lov?: Link[]
  [k: string]: unknown
}

export interface Link {
  /**
   * URI or URI template of the linked resource
   */
  href: string
  /**
   * MIME type of the linked resource
   */
  type?: string
  /**
   * Indicates that a URI template is used in href
   */
  templated?: boolean
  /**
   * Title of the linked resource
   */
  title?: string
  /**
   * Relation between the linked resource and its containing collection
   */
  rel?: Rel | Rel[]
  /**
   * Properties associated to the linked resource
   */
  properties?: EPUBProfileLinkProperties &
    EncryptionModuleLinkProperties &
    OPDSLinkProperties
  /**
   * Height of the linked resource in pixels
   */
  height?: number
  /**
   * Width of the linked resource in pixels
   */
  width?: number
  /**
   * Original size of the resource in bytes, prior to any use of encryption or compression in an archive
   */
  size?: number
  /**
   * Bitrate of the linked resource in kbps
   */
  bitrate?: number
  /**
   * Length of the linked resource in seconds
   */
  duration?: number
  /**
   * Expected language of the linked resource
   */
  language?: string | string[]
  /**
   * Alternate resources for the linked resource
   */
  alternate?: Link[]
  /**
   * Resources that are children of the linked resource, in the context of a given collection role
   */
  children?: Link[]
  [k: string]: unknown
}
export interface EPUBProfileLinkProperties {
  /**
   * Identifies content contained in the linked resource, that cannot be strictly identified using a media type.
   */
  contains?: ("mathml" | "onix" | "remote-resources" | "js" | "svg" | "xmp")[]
  [k: string]: unknown
}
export interface EncryptionModuleLinkProperties {
  /**
   * Indicates that a resource is encrypted/obfuscated and provides relevant information for decryption
   */
  encrypted?: {
    /**
     * Identifies the algorithm used to encrypt the resource
     */
    algorithm: string
    /**
     * Compression method used on the resource
     */
    compression?: string
    /**
     * Original length of the resource in bytes before compression and/or encryption
     */
    originalLength?: number
    /**
     * Identifies the encryption profile used to encrypt the resource
     */
    profile?: string
    /**
     * Identifies the encryption scheme used to encrypt the resource
     */
    scheme?: string
    [k: string]: unknown
  }
  [k: string]: unknown
}
export interface OPDSLinkProperties {
  /**
   * Provide a hint about the expected number of items returned
   */
  numberOfItems?: number
  /**
   * The price of a publication is tied to its acquisition link
   */
  price?: {
    value: number
    currency:
      | "AED"
      | "AFN"
      | "ALL"
      | "AMD"
      | "ANG"
      | "AOA"
      | "ARS"
      | "AUD"
      | "AWG"
      | "AZN"
      | "BAM"
      | "BBD"
      | "BDT"
      | "BGN"
      | "BHD"
      | "BIF"
      | "BMD"
      | "BND"
      | "BOB"
      | "BOV"
      | "BRL"
      | "BSD"
      | "BTN"
      | "BWP"
      | "BYN"
      | "BZD"
      | "CAD"
      | "CDF"
      | "CHE"
      | "CHF"
      | "CHW"
      | "CLF"
      | "CLP"
      | "CNY"
      | "COP"
      | "COU"
      | "CRC"
      | "CUC"
      | "CUP"
      | "CVE"
      | "CZK"
      | "DJF"
      | "DKK"
      | "DOP"
      | "DZD"
      | "EGP"
      | "ERN"
      | "ETB"
      | "EUR"
      | "FJD"
      | "FKP"
      | "GBP"
      | "GEL"
      | "GHS"
      | "GIP"
      | "GMD"
      | "GNF"
      | "GTQ"
      | "GYD"
      | "HKD"
      | "HNL"
      | "HRK"
      | "HTG"
      | "HUF"
      | "IDR"
      | "ILS"
      | "INR"
      | "IQD"
      | "IRR"
      | "ISK"
      | "JMD"
      | "JOD"
      | "JPY"
      | "KES"
      | "KGS"
      | "KHR"
      | "KMF"
      | "KPW"
      | "KRW"
      | "KWD"
      | "KYD"
      | "KZT"
      | "LAK"
      | "LBP"
      | "LKR"
      | "LRD"
      | "LSL"
      | "LYD"
      | "MAD"
      | "MDL"
      | "MGA"
      | "MKD"
      | "MMK"
      | "MNT"
      | "MOP"
      | "MRU"
      | "MUR"
      | "MVR"
      | "MWK"
      | "MXN"
      | "MXV"
      | "MYR"
      | "MZN"
      | "NAD"
      | "NGN"
      | "NIO"
      | "NOK"
      | "NPR"
      | "NZD"
      | "OMR"
      | "PAB"
      | "PEN"
      | "PGK"
      | "PHP"
      | "PKR"
      | "PLN"
      | "PYG"
      | "QAR"
      | "RON"
      | "RSD"
      | "RUB"
      | "RWF"
      | "SAR"
      | "SBD"
      | "SCR"
      | "SDG"
      | "SEK"
      | "SGD"
      | "SHP"
      | "SLL"
      | "SOS"
      | "SRD"
      | "SSP"
      | "STN"
      | "SVC"
      | "SYP"
      | "SZL"
      | "THB"
      | "TJS"
      | "TMT"
      | "TND"
      | "TOP"
      | "TRY"
      | "TTD"
      | "TWD"
      | "TZS"
      | "UAH"
      | "UGX"
      | "USD"
      | "USN"
      | "UYI"
      | "UYU"
      | "UZS"
      | "VEF"
      | "VES"
      | "VND"
      | "VUV"
      | "WST"
      | "XAF"
      | "XAG"
      | "XAU"
      | "XBA"
      | "XBB"
      | "XBC"
      | "XBD"
      | "XCD"
      | "XDR"
      | "XOF"
      | "XPD"
      | "XPF"
      | "XPT"
      | "XSU"
      | "XTS"
      | "XUA"
      | "XXX"
      | "YER"
      | "ZAR"
      | "ZMW"
      | "ZWL"
    [k: string]: unknown
  }
  /**
   * Indirect acquisition provides a hint for the expected media type that will be acquired after additional steps
   */
  indirectAcquisition?: OPDSAcquisitionObject[]
  /**
   * Library-specific feature for unavailable books that support a hold list
   */
  holds?: {
    total?: number
    position?: number
    [k: string]: unknown
  }
  /**
   * Library-specific feature that contains information about the copies that a library has acquired
   */
  copies?: {
    total?: number
    available?: number
    [k: string]: unknown
  }
  /**
   * Indicates the availability of a given resource
   */
  availability?: {
    state: "available" | "unavailable" | "reserved" | "ready"
    /**
     * Timestamp for the previous state change
     */
    since?: {
      [k: string]: unknown
    } & string
    /**
     * Timestamp for the next state change
     */
    until?: {
      [k: string]: unknown
    } & string
    [k: string]: unknown
  }
  [k: string]: unknown
}
export interface OPDSAcquisitionObject {
  type: string
  child?: OPDSAcquisitionObject[]
  [k: string]: unknown
}
export interface EPUBProfileMetadata {
  mediaOverlay?: {
    /**
     * Author-defined CSS class name to apply to the currently-playing EPUB Content Document element.
     */
    activeClass?: string
    /**
     * Author-defined CSS class name to apply to the EPUB Content Document's document element when playback is active.
     */
    playbackActiveClass?: string
    [k: string]: unknown
  }
  [k: string]: unknown
}
export interface AccessibilityObject {
  conformsTo?: string | string[]
  exemption?:
    | "eaa-disproportionate-burden"
    | "eaa-fundamental-alteration"
    | "eaa-microenterprise"
  accessMode?: (
    | "auditory"
    | "chartOnVisual"
    | "chemOnVisual"
    | "colorDependent"
    | "diagramOnVisual"
    | "mathOnVisual"
    | "musicOnVisual"
    | "tactile"
    | "textOnVisual"
    | "textual"
    | "visual"
  )[]
  accessModeSufficient?: (
    | ("auditory" | "tactile" | "textual" | "visual")
    | ("auditory" | "tactile" | "textual" | "visual")[]
  )[]
  feature?: (
    | "annotations"
    | "ARIA"
    | "bookmarks"
    | "index"
    | "pageBreakMarkers"
    | "printPageNumbers"
    | "pageNavigation"
    | "readingOrder"
    | "structuralNavigation"
    | "tableOfContents"
    | "taggedPDF"
    | "alternativeText"
    | "audioDescription"
    | "closedCaptions"
    | "captions"
    | "describedMath"
    | "longDescription"
    | "openCaptions"
    | "signLanguage"
    | "transcript"
    | "displayTransformability"
    | "synchronizedAudioText"
    | "timingControl"
    | "unlocked"
    | "ChemML"
    | "latex"
    | "latex-chemistry"
    | "MathML"
    | "MathML-chemistry"
    | "ttsMarkup"
    | "highContrastAudio"
    | "highContrastDisplay"
    | "largePrint"
    | "braille"
    | "tactileGraphic"
    | "tactileObject"
    | "fullRubyAnnotations"
    | "horizontalWriting"
    | "rubyAnnotations"
    | "verticalWriting"
    | "withAdditionalWordSegmentation"
    | "withoutAdditionalWordSegmentation"
    | "none"
    | "unknown"
  )[]
  hazard?: (
    | "flashing"
    | "motionSimulation"
    | "sound"
    | "none"
    | "noFlashingHazard"
    | "noMotionSimulationHazard"
    | "noSoundHazard"
    | "unknown"
    | "unknownFlashingHazard"
    | "unknownMotionSimulationHazard"
    | "unknownSoundHazard"
  )[]
  certification?: {
    certifiedBy?: string
    credential?: string
    report?: string
    [k: string]: unknown
  }
  summary?: string
  [k: string]: unknown
}
export interface ContributorObject {
  name: LanguageMap
  identifier?: string
  altIdentifier?: AlternateIdentifiers
  sortAs?: LanguageMap
  role?: string | string[]
  links?: Link[]
  [k: string]: unknown
}
export interface SubjectObject {
  name: LanguageMap
  sortAs?: LanguageMap
  code?: string
  scheme?: string
  links?: Link[]
  [k: string]: unknown
}
export interface CollectionObject {
  name: LanguageMap
  identifier?: string
  altIdentifier?: AlternateIdentifiers
  sortAs?: LanguageMap
  position?: number
  links?: Link[]
  [k: string]: unknown
}
export interface PeriodicalObject {
  name: LanguageMap
  identifier?: string
  altIdentifier?: AlternateIdentifiers
  sortAs?: LanguageMap
  position?: number
  links?: Link[]
  issue?: Issue
  volume?: Volume
  [k: string]: unknown
}
export interface IssueObject {
  name?: LanguageMap
  identifier?: string
  altIdentifier?: AlternateIdentifiers
  sortAs?: LanguageMap
  position: number
  links?: Link[]
  article?: Article
  chapter?: Chapter
  [k: string]: unknown
}
export interface ArticleObject {
  name: LanguageMap
  identifier?: string
  altIdentifier?: AlternateIdentifiers
  sortAs?: LanguageMap
  author?: Contributor
  translator?: Contributor
  editor?: Contributor
  artist?: Contributor
  illustrator?: Contributor
  contributor?: Contributor
  description?: string
  numberOfPages?: number
  position?: number
  links?: Link[]
  [k: string]: unknown
}
export interface ChapterObject {
  name?: LanguageMap
  identifier?: string
  altIdentifier?: AlternateIdentifiers
  sortAs?: LanguageMap
  position: number
  series?: Series
  links?: Link[]
  [k: string]: unknown
}
export interface SeriesObject {
  name: LanguageMap
  identifier?: string
  altIdentifier?: AlternateIdentifiers
  sortAs?: LanguageMap
  position?: number
  links?: Link[]
  chapter?: Chapter
  episode?: Episode
  issue?: Issue
  season?: Season
  storyArc?: StoryArc
  volume?: Volume
  [k: string]: unknown
}
export interface EpisodeObject {
  name?: LanguageMap
  identifier?: string
  altIdentifier?: AlternateIdentifiers
  sortAs?: LanguageMap
  position: number
  links?: Link[]
  [k: string]: unknown
}
export interface SeasonObject {
  name?: LanguageMap
  identifier?: string
  altIdentifier?: AlternateIdentifiers
  sortAs?: LanguageMap
  position: number
  links?: Link[]
  episode?: Episode
  [k: string]: unknown
}
export interface StoryArcObject {
  name: LanguageMap
  identifier?: string
  altIdentifier?: AlternateIdentifiers
  sortAs?: LanguageMap
  position?: number
  links?: Link[]
  chapter?: Chapter
  episode?: Episode
  issue?: Issue
  [k: string]: unknown
}
export interface VolumeObject {
  name?: LanguageMap
  identifier?: string
  altIdentifier?: AlternateIdentifiers
  sortAs?: LanguageMap
  position: number
  links?: Link[]
  chapter?: Chapter
  issue?: Issue
  storyArc?: StoryArc
  [k: string]: unknown
}

// this is not a part of the generated webpub schema

/**
 * @see https://readium.org/webpub-manifest/relationships.html
 */
export type Rel =
  | "alternate"
  | "contents"
  | "cover"
  | "first"
  | "last"
  | "manifest"
  | "search"
  | "self"
  | "start"
