"use client"

import { ImportRulesSection, ScanControlsSection } from "./files-tab"

export function FilesPage() {
  return (
    <div className="space-y-6">
      <ImportRulesSection />
      <ScanControlsSection />
    </div>
  )
}
