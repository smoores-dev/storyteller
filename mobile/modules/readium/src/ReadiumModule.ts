import { NativeModule, requireNativeModule } from "expo-modules-core"

import { type UUID } from "@/uuid"

import {
  type ReadiumClip,
  type ReadiumLink,
  type ReadiumLocator,
  type ReadiumManifest,
  type ReadiumTextFragment,
  type StorytellerTrack,
} from "./Readium.types"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventsMap = Record<string, (...args: any[]) => void>

interface ReadiumEvents extends EventsMap {
  clipChanged(clip: ReadiumClip): void
  isPlayingChanged(event: { isPlaying: boolean }): void
  positionChanged(event: { position: number }): void
  trackChanged(event: {
    track: StorytellerTrack
    position: number
    index: number
  }): void
}

declare class ReadiumModule extends NativeModule<ReadiumEvents> {
  extractArchive(archiveUrl: string, extractedUrl: string): Promise<void>
  openPublication(
    bookUuid: UUID,
    expandedBookUri: string,
    clips?: ReadiumClip[],
  ): Promise<ReadiumManifest | string>
  buildAudiobookManifest(bookUuid: UUID): Promise<ReadiumManifest>
  locateLink(bookUuid: UUID, link: ReadiumLink): Promise<ReadiumLocator>
  getPositions(bookUuid: UUID): Promise<ReadiumLocator[]>
  getResource(bookUuid: UUID, link: ReadiumLink): Promise<string>
  getClip(bookUuid: UUID, locator: ReadiumLocator): Promise<ReadiumClip>
  getOverlayClips(bookUuid: UUID): Promise<ReadiumClip[]>
  getFragment(
    bookUuid: UUID,
    clipUrl: string,
    position: number,
  ): Promise<ReadiumTextFragment | null>
  getNextFragment(
    bookUuid: UUID,
    locator: ReadiumLocator,
  ): Promise<ReadiumTextFragment | null>
  getPreviousFragment(
    bookUuid: UUID,
    locator: ReadiumLocator,
  ): Promise<ReadiumTextFragment | null>

  loadTracks(tracks: StorytellerTrack[]): Promise<void>
  getPosition(): Promise<number>
  getCurrentTrack(): Promise<StorytellerTrack | null>
  getCurrentTrackIndex(): Promise<number>
  getTracks(): Promise<StorytellerTrack[]>
  seekTo(relativeUri: string, position: number, skipEmit?: true): Promise<void>
  seekBy(amount: number): Promise<void>
  skip(position: number): Promise<void>
  next(): Promise<void>
  prev(): Promise<void>
  unload(): Promise<void>
  setRate(rate: number): Promise<void>
  setAutomaticRewind(config: {
    enabled: boolean
    afterInterruption: number
    afterBreak: number
  }): Promise<void>
  play(automaticRewind?: boolean): Promise<void>
  pause(): Promise<void>
  getIsPlaying(): Promise<boolean>
  getCurrentClip(): Promise<ReadiumClip | null>
}

// It loads the native module object from the JSI or falls back to
// the bridge module (from NativeModulesProxy) if the remote debugger is on.
export default requireNativeModule<ReadiumModule>("Readium")
