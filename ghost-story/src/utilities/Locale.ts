export function languageCodeToName(languageCode: string): string {
  const languageNames = new Intl.DisplayNames(["en"], { type: "language" })

  try {
    return languageNames.of(languageCode) ?? "Unknown"
  } catch {
    return "Unknown"
  }
}

export function formatLanguageCodeWithName(languageCode: string): string {
  return `${languageCodeToName(languageCode)} (${languageCode})`
}

export function getShortLanguageCode(langCode: string): string {
  const dashIndex = langCode.indexOf("-")
  return dashIndex === -1
    ? langCode
    : langCode.substring(0, dashIndex).toLowerCase()
}

export interface LangInfo {
  Name: string
  TwoLetterISOLanguageName: string
}
