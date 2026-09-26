"use client"

import { ProcessingSettingsFields, ReadaloudSection } from "./processing-tab"

export function ProcessingPage() {
  return (
    <div className="space-y-6">
      <ProcessingSettingsFields />
      <ReadaloudSection />
    </div>
  )
}
