import { type BookMetadataProvider } from "@storyteller-platform/nodekit/types"

import { cn } from "@/cn"
import { KNOWN_SOURCES, PROVIDER_SOURCES } from "@/externalSource"

export function SourceIcon({
  provider,
  className,
}: {
  provider: BookMetadataProvider
  className?: string
}) {
  return (
    <img
      draggable={false}
      className={cn("size-4 rounded-sm", className)}
      src={KNOWN_SOURCES[PROVIDER_SOURCES[provider]].logo}
      alt=""
    />
  )
}
