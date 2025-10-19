import { type EpubNavigator, type FrameManager } from "@readium/navigator"
import {
  type GuidedNavigationDocument,
  type Locator,
  type Publication,
} from "@readium/shared"

import { type TocItem } from "@/components/reader/readerParts/ReaderFooter"

export type TextAudioMap = Map<
  string,
  {
    totalDuration: number
    clips: Map<
      string,
      {
        href: string
        duration: number
        start: number
        end: number
        type: string
      }
    >
  }
>

export type AudioTextMap = Map<
  string,
  {
    duration: number
    start: number
    end: number
    segments: Array<{
      startTime: number
      endTime: number
      textHref: string
    }>
    type: string
  }
>

type ReaderRegistry = {
  navigator: EpubNavigator | null
  activeFrame: FrameManager | null
  publication: Publication | null
  positions: Locator[] | null
  guide: GuidedNavigationDocument | null
  resource: { href: string; content: string | null } | null
  textToAudioMap: TextAudioMap | null
  audioToTextMap: AudioTextMap | null
  tocItems: TocItem[] | null
}

const registry: ReaderRegistry = {
  navigator: null,
  activeFrame: null,
  publication: null,
  positions: null,
  resource: null,
  textToAudioMap: null,
  guide: null,
  audioToTextMap: null,
  tocItems: null,
}

export function registerTextToAudioMap(textToAudioMap: TextAudioMap | null) {
  registry.textToAudioMap = textToAudioMap
}

export function registerAudioToTextMap(audioToTextMap: AudioTextMap | null) {
  registry.audioToTextMap = audioToTextMap
}

export function registerNavigator(navigator: EpubNavigator | null) {
  registry.navigator = navigator
}

export function registerActiveFrame(frame: FrameManager | null) {
  registry.activeFrame = frame
}

export function registerPublication(publication: Publication | null) {
  registry.publication = publication
}

export function registerPositions(positions: Locator[] | null) {
  registry.positions = positions
}

export function registerResource(
  resource: {
    href: string
    content: string | null
  } | null,
) {
  registry.resource = resource
}

export function registerGuide(guide: GuidedNavigationDocument | null) {
  registry.guide = guide
}

export function registerTocItems(tocItems: TocItem[] | null) {
  registry.tocItems = tocItems
}

export function getNavigator(): EpubNavigator | null {
  return registry.navigator
}

export function getActiveFrame(): FrameManager | null {
  return (
    (registry.navigator?._cframes[0] as FrameManager | null) ??
    registry.activeFrame
  )
}

export function getPublication(): Publication | null {
  return registry.publication
}

export function getPositions(): Locator[] | null {
  return registry.positions
}

export function getResource(): {
  href: string
  content: string | null
} | null {
  return registry.resource
}

export function getGuide(): GuidedNavigationDocument | null {
  return registry.guide
}

export function getAudioToTextMap(): AudioTextMap | null {
  return registry.audioToTextMap
}

export function getTextToAudioMap(): TextAudioMap | null {
  return registry.textToAudioMap
}

export function getTocItems(): TocItem[] | null {
  return registry.tocItems
}

export function clearRegistry() {
  registry.navigator = null
  registry.activeFrame = null
  registry.publication = null
  registry.positions = null
  registry.resource = null
  registry.audioToTextMap = null
  registry.textToAudioMap = null
  registry.guide = null
  registry.tocItems = null
}
