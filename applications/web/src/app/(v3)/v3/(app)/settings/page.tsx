import { type Metadata } from "next"
import { getMessages } from "next-intl/server"

import { SettingsForm } from "@v3/_/components/settings-form/settings-form"
import {
  SETTINGS_SECTIONS,
  type SectionKeywords,
} from "@v3/_/components/settings-form/tabs"
import { withPageAuth } from "@v3/_/server/page-auth-wrapper"

import { type Invite, type ServerCapabilities, type User } from "@/apiModels"
import { fetchApiRoute } from "@/app/fetchApiRoute"
import {
  getImportRules,
  splitSettingsImportRules,
} from "@/database/importRules"
import { getConfigLockedKeys, getSettings } from "@/database/settings"
import { getCurrentVersion } from "@/versions"

export const metadata: Metadata = { title: null }

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
  tabsMessages: Record<
    string,
    { title?: string; sections?: Record<string, unknown> }
  >,
): SectionKeywords {
  const result: SectionKeywords = {}

  for (const section of SETTINGS_SECTIONS) {
    const tab = tabsMessages[section.page]
    const sectionData = tab?.sections?.[section.key]
    if (!sectionData) continue

    result[section.id] = [
      ...(tab.title ? [tab.title] : []),
      ...extractKeywords(sectionData as Record<string, unknown>),
    ]
  }

  return result
}

export default withPageAuth<{ params: Promise<Record<string, unknown>> }>([
  "settingsUpdate",
])(async (_props, user) => {
  const canManageUsers =
    user.permissions.userList || user.permissions.inviteList

  const [
    settings,
    rules,
    messages,
    configLockedKeys,
    capabilities,
    users,
    invites,
  ] = await Promise.all([
    getSettings(),
    getImportRules(),
    getMessages(),
    getConfigLockedKeys(),
    fetchApiRoute<ServerCapabilities>("/server/capabilities"),
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
  const { importRules, autoIgnoreRules } = splitSettingsImportRules(rules)

  return (
    <SettingsForm
      settings={{ ...settings, importRules, autoIgnoreRules }}
      sectionKeywords={sectionKeywords}
      configLockedKeys={Array.from(configLockedKeys)}
      capabilities={capabilities}
      currentVersion={currentVersion}
      initialUsers={users}
      initialInvites={invites}
    />
  )
})
