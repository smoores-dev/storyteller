"use client"

import { MetadataProvidersSection } from "./metadata-providers-section"
import { DefaultStatusSection, ReadBehaviorSection } from "./metadata-tab"

export function MetadataPage() {
  return (
    <div className="space-y-6">
      <ReadBehaviorSection />
      <MetadataProvidersSection />
      <DefaultStatusSection />
    </div>
  )
}
