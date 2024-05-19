import { NativeSyntheticEvent, StyleProp, ViewStyle } from "react-native"

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
  text?: {
    after?: string
    before?: string
    highlight?: string
  }
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
    language?: string
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
  bookId: number
  locator: ReadiumLocator
  onLocatorChange?: (event: NativeSyntheticEvent<ReadiumLocator>) => void
  onMiddleTouch?: (event: NativeSyntheticEvent<void>) => void
  isPlaying?: boolean
}

export type EPUBViewRef = {
  next: () => Promise<ReadiumLocator>
  prev: () => Promise<ReadiumLocator>
  findOnPage: (locators: ReadiumLocator[]) => Promise<ReadiumLocator[]>
}
