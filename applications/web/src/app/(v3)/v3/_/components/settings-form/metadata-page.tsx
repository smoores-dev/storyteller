"use client"

import { DefaultStatusSection, ReadBehaviorSection } from "./metadata-tab"

export function MetadataPage() {
  return (
    <div className="space-y-6">
      <ReadBehaviorSection />
      <DefaultStatusSection />
    </div>
  )
}
