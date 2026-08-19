import { type Metadata } from "next"
import { getMessages, getTranslations } from "next-intl/server"

import { SettingsForm } from "@v3/_/components/settings-form/settings-form"
import {
  type SectionKeywords,
  settingsFormTabs,
} from "@v3/_/components/settings-form/tabs"
import { withPageAuth } from "@v3/_/server/page-auth-wrapper"

import { type Invite, type User } from "@/apiModels"
import { fetchApiRoute } from "@/app/fetchApiRoute"
import { getConfigLockedKeys, getSettings } from "@/database/settings"
import { getCurrentVersion } from "@/versions"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("SettingsPage")
  return {
    title: t("title"),
  }
}

function extractKeywords(obj: Record<string, unknown>): string[] {
  const keywords: string[] = []
  for (const value of Object.values(obj)) {
    if (typeof value === "string") {
      keywords.push(value)
    } else if (typeof value === "object" && value !== null) {
      keywords.push(...extractKeywords(value as Record<string, unknown>))
    }
  }
  return keywords
}

function generateSectionKeywords(
  tabsMessages: Record<string, { sections?: Record<string, unknown> }>,
): SectionKeywords {
  const result: SectionKeywords = {} as SectionKeywords

  for (const tab of settingsFormTabs) {
    result[tab] = {}

    const tabData = tabsMessages[tab]
    if (!tabData?.sections) {
      continue
    }

    for (const [sectionKey, sectionData] of Object.entries(tabData.sections)) {
      result[tab][sectionKey] = extractKeywords(
        sectionData as Record<string, unknown>,
      )
    }
  }

  return result
}

export default withPageAuth<{ params: Promise<Record<string, unknown>> }>([
  "settingsUpdate",
])(async (_props, user) => {
  const canManageUsers =
    user.permissions.userList || user.permissions.inviteList

  const [settings, messages, configLockedKeys, users, invites] =
    await Promise.all([
      getSettings(),
      getMessages(),
      getConfigLockedKeys(),
      canManageUsers
        ? fetchApiRoute<User[]>("/users")
        : Promise.resolve(undefined),
      canManageUsers
        ? fetchApiRoute<Invite[]>("/invites")
        : Promise.resolve(undefined),
    ])

  const settingsMessages = messages.SettingsPage as {
    tabs: Record<string, { sections?: Record<string, unknown> }>
  }
  const sectionKeywords = generateSectionKeywords(settingsMessages.tabs)

  const currentVersion = getCurrentVersion()

  return (
    <SettingsForm
      settings={settings}
      sectionKeywords={sectionKeywords}
      configLockedKeys={Array.from(configLockedKeys)}
      currentVersion={currentVersion}
      initialUsers={users}
      initialInvites={invites}
    />
  )
})
