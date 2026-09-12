import { type Metadata } from "next"
import { getMessages, getTranslations } from "next-intl/server"
import { forbidden } from "next/navigation"

import { PreferencesForm } from "@v3/_/components/preferences-form/preferences-form"
import {
  type SectionKeywords,
  preferenceTabs,
} from "@v3/_/components/preferences-form/tabs"
import { withPageAuth } from "@v3/_/server/page-auth-wrapper"

import {
  getConfigLockedKeys,
  getPreferenceDefaults,
  getSettings,
} from "@/database/settings"
import { formUserPreferences } from "@/database/userPreferencesTypes"
import { getUserSettings } from "@/database/userSettings"
import { getAccounts } from "@/database/users"
import { env } from "@/env"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("PreferencesPage")
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
  const result = {} as SectionKeywords

  for (const tab of preferenceTabs) {
    result[tab] = {}

    const sections = tabsMessages[tab]?.sections
    if (!sections) continue

    for (const [sectionKey, sectionData] of Object.entries(sections)) {
      result[tab][sectionKey] = extractKeywords(
        sectionData as Record<string, unknown>,
      )
    }
  }

  return result
}

export default withPageAuth<{ params: Promise<Record<string, unknown>> }>([])(
  async (_props, user) => {
    if (env.STORYTELLER_DEMO_MODE && !user.permissions.userCreate) {
      forbidden()
    }

    const [settings, rawPreferences, linkedAccounts, messages, prefDefaults] =
      await Promise.all([
        getSettings(),
        getUserSettings(user.id),
        getAccounts(user.id),
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
        providers={oauthProviders.map((provider) =>
          provider.kind === "built-in"
            ? { id: provider.id, name: provider.id }
            : { id: provider.name, name: provider.name },
        )}
        disablePasswordLogin={settings.disablePasswordLogin}
        preferenceDefaults={prefDefaults}
        preferenceDefaultsLocked={preferenceDefaultsLocked}
      />
    )
  },
)
