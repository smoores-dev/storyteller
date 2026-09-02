import { MiniPlayer } from "@v3/_/components/reader/MiniPlayer/MiniPlayer"
import { UserPreferencesProvider } from "@v3/_/components/user-preferences-provider"

import { assertAuthenticatedUser } from "@/auth/auth"
import { getPreferenceDefaults } from "@/database/settings"
import { resolveUserPreferences } from "@/database/userPreferencesTypes"
import { getUserSettings } from "@/database/userSettings"

export default async function ReaderLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await assertAuthenticatedUser()

  const [preferenceDefaults, userSettings] = await Promise.all([
    getPreferenceDefaults(),
    getUserSettings(user.id),
  ])

  const preferences = resolveUserPreferences(userSettings, preferenceDefaults)

  return (
    <UserPreferencesProvider
      initialPreferences={preferences}
      preferenceDefaults={preferenceDefaults}
    >
      {children}
      <MiniPlayer />
    </UserPreferencesProvider>
  )
}
