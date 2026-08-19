export type AnnouncementKind = "modal"

export type Announcement = {
  key: string
  kind: AnnouncementKind
  // limit to beta/prerelease builds (see BETA_TAGS in versions.ts)
  onlyBeta?: boolean
}

export const ANNOUNCEMENTS: readonly Announcement[] = [
  { key: "v3-beta-welcome", kind: "modal", onlyBeta: true },
]

// the userSettings name under which a dismissal is recorded
export function dismissalKey(key: string): string {
  return `announcement.dismissed.${key}`
}
