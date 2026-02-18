import { type UUID } from "crypto"

import {
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native"

import { type Highlight } from "@/database/highlights"
import { type CustomFont } from "@/database/preferencesTypes"

export type ReadiumLocation = {
  fragments?: string[]
  progression?: number
  position?: number
  totalProgression?: number
  cssSelector?: string
  partialCfi?: string
  domRange?: {
    start: {
      cssSelector: string
      textNodeIndex: number
      charOffset?: number
    }
    end?: {
      cssSelector: string
      textNodeIndex: number
      charOffset?: number
    }
  }
}

export type ReadiumLocator = {
  href: string
  type: string
  title?: string
  locations?: ReadiumLocation
  target?: number // I don't know what this is but it shows up sometimes
  text?: {
    after?: string
    before?: string
    highlight?: string
  }
}

export type TimestampedLocator = {
  timestamp: number
  locator: ReadiumLocator
}

export type ReadiumLocalizedString = string | Record<string, string>

export type ReadiumLink = {
  href: string
  type?: string
  templated?: string
  title?: string
  rel?: string | string[]
  height?: number
  width?: number
  bitrate?: number
  duration?: number
  language?: string | string[]
  alternate?: ReadiumLink[]
  children?: ReadiumLink[]
  properties?: {
    mediaOverlay?: string
    contains?: Array<
      "mathml" | "onix" | "remote-resources" | "js" | "svg" | "xmp"
    >
    layout?: "fixed" | "reflowable"
    encrypted?: {
      algorithm: string
      compression: string
      originalLength: number
      profile: string
      scheme: string
    }
    clipped?: boolean
    fit?: "contain" | "cover" | "width" | "height"
    orientation?: "auto" | "landscape" | "portrait"
    page?: "left" | "right" | "center"
    spread?: "auto" | "both" | "none" | "landscape"
  }
}

export type ReadiumClip = {
  relativeUrl: string
  fragmentId: string
  start: number
  end: number
  duration: number
  locator: ReadiumLocator
}

export type ReadiumTextFragment = {
  href: string
  fragment: string
  locator: ReadiumLocator
}

export type ReadiumContributor =
  | string
  | {
      name: ReadiumLocalizedString
      identifier?: string
      sortAs?: string
      role?: string | string[]
      position?: number
      links?: ReadiumLink[]
    }

export type ReadiumSubject =
  | string
  | {
      name: ReadiumLocalizedString
      sortAs?: string
      code?: string
      scheme?: string
      links?: ReadiumLink[]
    }

export type ReadiumManifest = {
  "@context": string | string[]
  metadata: {
    identifier?: string
    "@type"?: string
    conformsTo?: string | string[]
    title: ReadiumLocalizedString
    sortAs?: ReadiumLocalizedString
    subtitle?: ReadiumLocalizedString
    accessibility?: {
      conformsTo?: string | string[]
      certification?: {
        certifiedBy?: string
        credential?: string
        report?: string
      }
      summary?: string
      accessMode?: Array<
        | "auditory"
        | "chartOnVisual"
        | "chemOnVisual"
        | "colorDependent"
        | "diagromOnVisual"
        | "mathOnVisual"
        | "musicOnVisual"
        | "tactile"
        | "textOnVisual"
        | "textual"
        | "visual"
      >
      acessModeSufficient?: Array<"auditory" | "tactile" | "textual" | "visual">
      feature?: Array<
        | "annotations"
        | "ARIA"
        | "bookmarks"
        | "index"
        | "printPageNumbers"
        | "readingOrder"
        | "structuralNavigation"
        | "tableOfContents"
        | "taggedPDF"
        | "alternativeText"
        | "audioDescription"
        | "captions"
        | "describedMath"
        | "longDescription"
        | "rubyAnnotations"
        | "signLanguage"
        | "transcript"
        | "displayTransformability"
        | "synchronizedAudioText"
        | "timingControl"
        | "unlocked"
        | "ChemML"
        | "latex"
        | "MathML"
        | "ttsMarkup"
        | "highContrastAudio"
        | "highContrastDisplay"
        | "largePrint"
        | "braille"
        | "tactileGraphic"
        | "tactileObject"
        | "none"
      >
      hazard?: Array<
        | "flashing"
        | "noFlashingHazard"
        | "motionSimulation"
        | "noMotionSimulationHazard"
        | "sound"
        | "noSoundHazard"
        | "unknown"
        | "none"
      >
    }
    modified?: string
    published?: string
    language?: string | string[]
    author?: ReadiumContributor | ReadiumContributor[]
    translator?: ReadiumContributor | ReadiumContributor[]
    editor?: ReadiumContributor | ReadiumContributor[]
    artist?: ReadiumContributor | ReadiumContributor[]
    illustrator?: ReadiumContributor | ReadiumContributor[]
    letterer?: ReadiumContributor | ReadiumContributor[]
    penciler?: ReadiumContributor | ReadiumContributor[]
    colorist?: ReadiumContributor | ReadiumContributor[]
    inker?: ReadiumContributor | ReadiumContributor[]
    narrator?: ReadiumContributor | ReadiumContributor[]
    contributor?: ReadiumContributor | ReadiumContributor[]
    publisher?: ReadiumContributor | ReadiumContributor[]
    imprint?: ReadiumContributor | ReadiumContributor[]
    subject?: ReadiumSubject[]
    readingProgression?: "rtl" | "ltr" | "ttb" | "btt" | "auto"
    description?: string
    duration: number
    numberOfPages?: number
    belongsTo?: {
      collection?: ReadiumContributor | ReadiumContributor[]
      series?: ReadiumContributor | ReadiumContributor[]
    }
    presentation?: {
      layout?: "fixed" | "reflowable"
    }
  }
  links: ReadiumLink[]
  readingOrder: Array<ReadiumLink & { type: string }>
  resources?: Array<ReadiumLink & { type: string }>
  toc?: ReadiumLink[]
  pageList?: ReadiumLink[]
  landmarks?: ReadiumLink[]
  loa?: ReadiumLink[]
  loi?: ReadiumLink[]
  lot?: ReadiumLink[]
  lov?: ReadiumLink[]
}

export type EPUBViewProps = {
  style: StyleProp<ViewStyle>
  bookUuid: UUID
  locator: ReadiumLocator | null
  bookmarks: ReadiumLocator[]
  highlights: Highlight[]
  colorTheme: { foreground: string; background: string }
  fontScale?: number | undefined
  lineHeight?: number | undefined
  textAlign?: "justify" | "left" | undefined
  fontFamily?: string | undefined
  readaloudColor?: string | undefined
  customFonts?: CustomFont[] | undefined
  onHighlightTap?: (
    event: NativeSyntheticEvent<{ decoration: UUID; x: number; y: number }>,
  ) => void
  onBookmarksActivate?: (
    event: NativeSyntheticEvent<{ activeBookmarks: ReadiumLocator[] }>,
  ) => void
  onLocatorChange?: (event: NativeSyntheticEvent<ReadiumLocator>) => void
  onMiddleTouch?: (event: NativeSyntheticEvent<void>) => void
  onSelection?: (
    event: NativeSyntheticEvent<
      | {
          x: number
          y: number
          locator: ReadiumLocator
        }
      | { cleared: true }
    >,
  ) => void
  onDoubleTouch?: (event: NativeSyntheticEvent<ReadiumLocator>) => void
  onError?: (
    event: NativeSyntheticEvent<{
      errorDescription: string
      failureReason: string
      recoverySuggestion: string
    }>,
  ) => void
  isPlaying?: boolean
}

export type EPUBViewRef = {
  goForward: () => Promise<void>
  goBackward: () => Promise<void>
}

export interface StorytellerTrack {
  uri: string
  bookUuid: string
  duration: number
  bookTitle: string
  title: string
  author: string | null
  coverUri: string | null
  relativeUri: string
  narrator: string | null
  mimeType: string
}
