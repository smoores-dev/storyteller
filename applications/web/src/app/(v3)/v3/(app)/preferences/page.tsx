import { type Metadata } from "next"
import { getMessages } from "next-intl/server"
import { forbidden } from "next/navigation"

import { PreferencesForm } from "@v3/_/components/preferences-form/preferences-form"
import {
  PREFERENCE_SECTIONS,
  type SectionKeywords,
} from "@v3/_/components/preferences-form/tabs"
import { withPageAuth } from "@v3/_/server/page-auth-wrapper"

import { getApiTokens } from "@/database/apiTokens"
import {
  getConfigLockedKeys,
  getPreferenceDefaults,
  getSettings,
} from "@/database/settings"
import { formUserPreferences } from "@/database/userPreferencesTypes"
import { getUserSettings } from "@/database/userSettings"
import { getAccounts } from "@/database/users"
import { env } from "@/env"

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

  for (const section of PREFERENCE_SECTIONS) {
    const tab = tabsMessages[section.tab]
    const keys = [
      section.id,
      ...("alsoMatches" in section ? section.alsoMatches : []),
    ]

    result[section.id] = [
      ...(tab?.title ? [tab.title] : []),
      ...keys.flatMap((key) =>
        extractKeywords(
          (tab?.sections?.[key] ?? {}) as Record<string, unknown>,
        ),
      ),
    ]
  }

  return result
}

export default withPageAuth<{ params: Promise<Record<string, unknown>> }>([])(
  async (_props, user) => {
    if (env.STORYTELLER_DEMO_MODE && !user.permissions.userCreate) {
      forbidden()
    }

    const [
      settings,
      rawPreferences,
      linkedAccounts,
      apiTokens,
      messages,
      prefDefaults,
    ] = await Promise.all([
      getSettings(),
      getUserSettings(user.id),
      getAccounts(user.id),
      getApiTokens(user.id),
      getMessages(),
      getPreferenceDefaults(),
    ])

    const preferences = formUserPreferences(rawPreferences)

    const preferenceDefaultsLocked = (await getConfigLockedKeys()).has(
      "preferenceDefaults",
    )

    const preferencesMessages = messages.PreferencesPage as {
      tabs: Record<string, { sections?: Record<string, unknown> }>
    }
    const sectionKeywords = generateSectionKeywords(preferencesMessages.tabs)

    const oauthProviders = settings.authProviders

    return (
      <PreferencesForm
        user={user}
        preferences={preferences}
        sectionKeywords={sectionKeywords}
        linkedAccounts={linkedAccounts}
        apiTokens={apiTokens}
        providers={oauthProviders.map((provider) =>
          provider.kind === "built-in"
            ? { id: provider.id, name: provider.id }
            : { id: provider.name, name: provider.name },
        )}
        disablePasswordLogin={settings.disablePasswordLogin}
        preferenceDefaults={prefDefaults}
        preferenceDefaultsLocked={preferenceDefaultsLocked}
        kindleSender={settings.smtpHost ? settings.smtpFrom : null}
      />
    )
  },
)
