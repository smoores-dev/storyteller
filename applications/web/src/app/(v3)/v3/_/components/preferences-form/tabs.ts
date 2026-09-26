export const preferenceTabs = ["general", "appearance", "books"] as const

export const PREFERENCE_TABS = ["profile", ...preferenceTabs] as const

export type PreferenceTab = (typeof preferenceTabs)[number]

export type Tab = (typeof PREFERENCE_TABS)[number]

export type SectionKeywords = {
  [K in PreferenceTab]: {
    [section: string]: string[]
  }
}
