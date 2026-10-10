const BCP47 = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/

const COMMON_LANGUAGES = [
  "ar",
  "bg",
  "bn",
  "ca",
  "cs",
  "cy",
  "da",
  "de",
  "el",
  "en",
  "eo",
  "es",
  "et",
  "eu",
  "fa",
  "fi",
  "fr",
  "ga",
  "gl",
  "he",
  "hi",
  "hr",
  "hu",
  "hy",
  "id",
  "is",
  "it",
  "ja",
  "ka",
  "ko",
  "la",
  "lt",
  "lv",
  "mk",
  "ms",
  "nb",
  "nl",
  "nn",
  "no",
  "pl",
  "pt",
  "ro",
  "ru",
  "sk",
  "sl",
  "sq",
  "sr",
  "sv",
  "sw",
  "ta",
  "te",
  "th",
  "tr",
  "uk",
  "ur",
  "vi",
  "zh",
]

const COMMON_LOCALES = [
  "en-US",
  "en-GB",
  "en-AU",
  "en-CA",
  "en-IN",
  "en-NZ",
  "en-ZA",
  "es-ES",
  "es-MX",
  "es-AR",
  "es-419",
  "fr-FR",
  "fr-CA",
  "fr-BE",
  "fr-CH",
  "pt-BR",
  "pt-PT",
  "de-DE",
  "de-AT",
  "de-CH",
  "nl-NL",
  "nl-BE",
  "zh-Hans",
  "zh-Hant",
  "zh-CN",
  "zh-TW",
  "sr-Latn",
  "sr-Cyrl",
]

const DISPLAY_LOCALES = ["en", "nl"]

let reverseIndex: Map<string, string> | null = null

function indexKey(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function buildReverseIndex(): Map<string, string> {
  const index = new Map<string, string>()

  const add = (name: string | undefined, tag: string) => {
    if (!name) return
    const key = indexKey(name)
    if (key && !index.has(key)) index.set(key, tag)
  }

  for (const displayLocale of DISPLAY_LOCALES) {
    let names: Intl.DisplayNames
    try {
      names = new Intl.DisplayNames([displayLocale], { type: "language" })
    } catch {
      continue
    }

    for (const tag of COMMON_LANGUAGES) add(names.of(tag), tag)
    for (const tag of COMMON_LOCALES) add(names.of(tag), tag)
  }

  return index
}

export function normalizeLanguage(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim().replace(/_/g, "-")
  if (!trimmed) return null

  if (BCP47.test(trimmed)) {
    try {
      const [canonical] = Intl.getCanonicalLocales(trimmed)
      if (canonical) return canonical
    } catch {
      return trimmed
    }
  }

  reverseIndex ??= buildReverseIndex()
  return reverseIndex.get(indexKey(trimmed)) ?? trimmed
}
