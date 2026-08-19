export const preferenceTabs = ["general", "appearance", "books"] as const

export type PreferenceTab = (typeof preferenceTabs)[number]

export type Tab = "profile" | PreferenceTab

export type SectionKeywords = {
  [K in PreferenceTab]: {
    [section: string]: string[]
  }
}
