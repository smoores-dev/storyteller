import { cookies } from "next/headers"

import { AnnouncementModal } from "@v3/_/components/announcements/announcement-modal"
import { AppSidebar } from "@v3/_/components/app-sidebar"
import { FloatingBookPanelProvider } from "@v3/_/components/books/FloatingBookPanel"
import { FloatingDock } from "@v3/_/components/floating/FloatingDock"
import { PathMismatchBanner } from "@v3/_/components/path-mismatch-banner"
import { ProcessingToast } from "@v3/_/components/processing/ProcessingToast"
import { MiniPlayer } from "@v3/_/components/reader/MiniPlayer/MiniPlayer"
import { SidebarInset, SidebarProvider } from "@v3/_/components/ui/sidebar"
import { UserPreferencesProvider } from "@v3/_/components/user-preferences-provider"
import { EscapeCascadeProvider } from "@v3/_/hooks/use-escape-cascade"
import { accentStyle } from "@v3/_/lib/accent-tokens"

import { assertAuthenticatedUser } from "@/auth/auth"
import { getPendingAnnouncements } from "@/database/announcements"
import { getDataDirAnchor } from "@/database/pathRewrite"
import { getPreferenceDefaults } from "@/database/settings"
import { ensureSidebarDefaults, getSidebarGroups } from "@/database/sidebar"
import { resolveUserPreferences } from "@/database/userPreferencesTypes"
import { getUserSettings } from "@/database/userSettings"
import { DATA_DIR } from "@/directories"
import { getCurrentVersion } from "@/versions"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await assertAuthenticatedUser()

  const cookieStore = await cookies()
  const currentVersion = getCurrentVersion()
  const defaultOpen = cookieStore.get("sidebar_state")?.value === "true"
  await ensureSidebarDefaults(user.id)

  const [sidebarGroups, preferenceDefaults, pendingAnnouncements, pathAnchor] =
    await Promise.all([
      getSidebarGroups(user.id),
      getPreferenceDefaults(),
      getPendingAnnouncements(user.id),
      user.permissions.settingsUpdate ? getDataDirAnchor() : null,
    ])

  const pathMismatch =
    pathAnchor !== null && pathAnchor !== DATA_DIR ? pathAnchor : null

  const preferences = resolveUserPreferences(
    await getUserSettings(user.id),
    preferenceDefaults,
  )

  return (
    <UserPreferencesProvider
      initialPreferences={preferences}
      preferenceDefaults={preferenceDefaults}
    >
      <SidebarProvider
        defaultOpen={defaultOpen}
        className="z-50"
        data-shell={preferences.shellTheme}
        style={
          {
            "--sidebar-width": "calc(var(--spacing) * 56)",
            "--header-height": "calc(var(--spacing) * 14)",
            ...accentStyle(preferences.accentColor),
          } as React.CSSProperties
        }
      >
        <AppSidebar
          variant="inset"
          user={user}
          className="absolute z-40"
          currentVersion={currentVersion}
          initialSidebarGroups={sidebarGroups}
        />
        <EscapeCascadeProvider>
          <FloatingBookPanelProvider>
            <SidebarInset className="overflow-x-hidden">
              {pathMismatch !== null && (
                <PathMismatchBanner
                  anchor={pathMismatch}
                  currentDataDir={DATA_DIR}
                />
              )}
              {children}
            </SidebarInset>
          </FloatingBookPanelProvider>
        </EscapeCascadeProvider>
        {user.permissions.bookProcess && <ProcessingToast />}
        <AnnouncementModal pending={pendingAnnouncements} />
        <FloatingDock>
          <MiniPlayer />
        </FloatingDock>
      </SidebarProvider>
    </UserPreferencesProvider>
  )
}
