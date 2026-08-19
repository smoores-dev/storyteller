import {
  ANNOUNCEMENTS,
  type Announcement,
  dismissalKey,
} from "@/announcement-builtins"
import type { UUID } from "@/uuid"
import { BETA_TAGS, getCurrentVersion } from "@/versions"

import { getUserSettings } from "./userSettings"

function isBetaBuild(): boolean {
  const version = getCurrentVersion()
  return BETA_TAGS.some((tag) => version.includes(tag))
}

export async function getPendingAnnouncements(
  userId: UUID,
): Promise<Announcement[]> {
  const settings = await getUserSettings(userId)
  const beta = isBetaBuild()

  return ANNOUNCEMENTS.filter((announcement) => {
    if (announcement.onlyBeta && !beta) return false
    return !settings[dismissalKey(announcement.key)]
  })
}
