import {
  ANNOUNCEMENTS,
  type Announcement,
  dismissalKey,
} from "@/announcement-builtins"
import { BETA_TAGS, getCurrentVersion } from "@/versions"

import { getSettings } from "./settings"
import { getUserSettings } from "./userSettings"
import { type UserWithPermissions } from "./users"

function isBetaBuild(): boolean {
  const version = getCurrentVersion()
  return BETA_TAGS.some((tag) => version.includes(tag))
}

export async function getPendingAnnouncements(
  user: UserWithPermissions,
): Promise<Announcement[]> {
  const settings = await getUserSettings(user.id)
  const beta = isBetaBuild()

  const pending = ANNOUNCEMENTS.filter((announcement) => {
    if (announcement.onlyBeta && !beta) return false
    if (announcement.permission && !user.permissions[announcement.permission]) {
      return false
    }
    return !settings[dismissalKey(announcement.key)]
  })

  if (!pending.some((announcement) => announcement.kind === "ctc-aligner")) {
    return pending
  }

  const { aligner } = await getSettings()
  if (aligner !== "ctc") return pending

  return pending.filter((announcement) => announcement.kind !== "ctc-aligner")
}
