export const accountTabs = ["profile", "devices"] as const

export const personalizationTabs = ["general", "appearance", "books"] as const

export const PREFERENCE_TABS = [...accountTabs, ...personalizationTabs] as const

export type Tab = (typeof PREFERENCE_TABS)[number]

export const FORM_TABS: readonly Tab[] = ["devices", ...personalizationTabs]

export type PreferenceSectionDef = {
  id: string
  tab: Tab
  alsoMatches?: readonly string[]
}

export const PREFERENCE_SECTIONS = [
  { id: "details", tab: "profile" },
  { id: "linkedAccounts", tab: "profile" },
  { id: "pairDevice", tab: "devices" },
  { id: "kindle", tab: "devices" },
  { id: "apiTokens", tab: "devices" },
  { id: "language", tab: "general" },
  { id: "accent", tab: "appearance" },
  { id: "colorfulness", tab: "appearance" },
  { id: "motion", tab: "appearance" },
  { id: "gridDisplay", tab: "books" },
  { id: "opening", tab: "books" },
  { id: "detail", tab: "books" },
  {
    id: "ratings",
    tab: "books",
    alsoMatches: ["ratingIcon", "ratingDimensions"],
  },
  { id: "defaultStatus", tab: "books" },
] as const satisfies readonly PreferenceSectionDef[]

export type PreferenceSectionId = (typeof PREFERENCE_SECTIONS)[number]["id"]

export type SectionKeywords = Partial<Record<PreferenceSectionId, string[]>>
