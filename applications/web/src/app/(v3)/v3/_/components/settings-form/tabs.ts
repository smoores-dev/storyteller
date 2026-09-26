import { type Permission } from "@/database/users"

export const settingsPages = [
  "files",
  "metadata",
  "processing",
  "server",
] as const

export type SettingsPage = (typeof settingsPages)[number]

export const adminTabs = [
  "users",
  "maintenance",
  "changelog",
  "logs",
  "queue",
  "backups",
] as const
export type AdminTab = (typeof adminTabs)[number]

export const tabs = [...settingsPages, ...adminTabs] as const

export type Tab = (typeof tabs)[number]

export type SettingsSectionDef = {
  id: string
  page: Tab
  key: string
  platform?: "desktop" | "web"
  permission?: Permission
}

export const SETTINGS_SECTIONS = [
  { id: "importRules", page: "files", key: "importRules" },
  { id: "scanning", page: "files", key: "scanning" },
  { id: "readBehavior", page: "metadata", key: "readBehavior" },
  { id: "defaultStatus", page: "metadata", key: "defaultStatus" },
  { id: "alignment", page: "processing", key: "alignment" },
  { id: "audio", page: "processing", key: "audio" },
  { id: "readaloud", page: "processing", key: "readaloud" },
  { id: "identity", page: "server", key: "identity" },
  { id: "authentication", page: "server", key: "auth" },
  { id: "upload", page: "server", key: "upload", platform: "web" },
  { id: "email", page: "server", key: "email" },
  { id: "opds", page: "server", key: "opds" },
  { id: "updates", page: "server", key: "updates", platform: "desktop" },
  { id: "invites", page: "users", key: "users-invites" },
  { id: "usersList", page: "users", key: "users-list" },
  {
    id: "libraryScan",
    page: "maintenance",
    key: "scan",
    permission: "bookProcess",
  },
  { id: "caches", page: "maintenance", key: "caches" },
  { id: "leftovers", page: "maintenance", key: "leftovers" },
  { id: "logFiles", page: "maintenance", key: "logs" },
  { id: "pathRewrite", page: "maintenance", key: "pathRewrite" },
] as const satisfies readonly SettingsSectionDef[]

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"]

export function isSectionOnPlatform(
  section: SettingsSectionDef,
  isTauri: boolean,
) {
  return !section.platform || section.platform === (isTauri ? "desktop" : "web")
}

export function canSeeSection(
  section: SettingsSectionDef,
  permissions: Partial<Record<Permission, boolean>> | null | undefined,
) {
  return !section.permission || !!permissions?.[section.permission]
}

export function sectionsForPage(page: Tab, isTauri: boolean) {
  return SETTINGS_SECTIONS.filter(
    (section) => section.page === page && isSectionOnPlatform(section, isTauri),
  )
}

export type SectionKeywords = Partial<Record<SettingsSectionId, string[]>>

const LEGACY_TAB_ALIASES: Record<string, Tab> = {
  library: "files",
  auth: "server",
  upload: "server",
  email: "server",
  opds: "server",
  app: "server",
}

export function resolveTab(value: string | null | undefined): Tab | null {
  if (!value) return null
  if ((tabs as readonly string[]).includes(value)) return value as Tab
  return LEGACY_TAB_ALIASES[value] ?? null
}
