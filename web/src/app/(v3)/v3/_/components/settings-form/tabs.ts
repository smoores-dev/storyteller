export const settingsFormTabs = [
  "library",
  "transcription",
  "auth",
  "upload",
  "email",
  "opds",
] as const

export type SettingsFormTab = (typeof settingsFormTabs)[number]

export const tabs = [...settingsFormTabs, "changelog"] as const

export type Tab = (typeof tabs)[number]

export type SectionKeywords = {
  [K in SettingsFormTab]: {
    [S: string]: string[]
  }
}
