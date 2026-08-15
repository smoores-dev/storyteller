export * from "./types.ts"
export {
  ADDON_SOURCES,
  NodeKitLoadError,
  StorytellerNodeKit,
  describeAddonResolution,
  loadAddon,
  resolveAddonPath,
} from "./nodekit.ts"
export type {
  AddonCandidate,
  AddonResolution,
  AddonSource,
  NodeKitRaw,
} from "./nodekit.ts"

import {
  type BookMetadataProvider,
  COVER_PROVIDERS,
  type CoverProvider,
  METADATA_PROVIDERS,
} from "./types.ts"

export function asMetadataProvider(
  value: string | null | undefined,
): BookMetadataProvider | undefined {
  return METADATA_PROVIDERS.includes(value as BookMetadataProvider)
    ? (value as BookMetadataProvider)
    : undefined
}

export function asCoverProvider(
  value: string | null | undefined,
): CoverProvider | undefined {
  return COVER_PROVIDERS.includes(value as CoverProvider)
    ? (value as CoverProvider)
    : undefined
}
