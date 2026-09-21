export type AnnouncementKind = "modal" | "ctc-aligner"

export type Announcement = {
  key: string
  kind: AnnouncementKind
  // limit to beta/prerelease builds (see BETA_TAGS in versions.ts)
  onlyBeta?: boolean
  permission?: "settingsUpdate"
}

export const ANNOUNCEMENTS: readonly Announcement[] = [
  { key: "v3-beta-welcome", kind: "modal", onlyBeta: true },
  { key: "ctc-aligner", kind: "ctc-aligner", permission: "settingsUpdate" },
]

// the userSettings name under which a dismissal is recorded
export function dismissalKey(key: string): string {
  return `announcement.dismissed.${key}`
}
