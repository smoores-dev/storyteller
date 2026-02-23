export const locales = {
  en: {
    label: "English",
    value: "en",
    flag: "🇺🇸",
  },
  nl: {
    label: "Nederlands",
    value: "nl",
    flag: "🇳🇱",
  },
} as const satisfies Record<string, Locale>

export type Locale = {
  label: string
  value: string
  flag: string
}
