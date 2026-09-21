import { type WordEntry } from "@echogarden/text-segmentation"
import { getCurrency } from "locale-currency"
import { toWords } from "to-words"

import { type Mapping } from "@storyteller-platform/mapping"
import { slugify as transliterateSlugify } from "@storyteller-platform/transliteration"

import TSCharacters from "./opencc/TSCharacters.json" with { type: "json" }

const traditionalToSimplified: Record<string, string> = TSCharacters

const replacerMap = new WeakMap<
  Intl.Locale,
  ReturnType<typeof createReplacers>
>()

// cache the vocab creation
const vocabCharsMap = new WeakMap<
  Map<string, number>,
  { locale: string; chars: string[]; allowedChars: string }
>()

function getCurrencySymbols(locale: Intl.Locale) {
  const region = locale.maximize().region

  const demoNumber = 123456.789
  const currencyFormat = new Intl.NumberFormat(locale, {
    style: "currency",
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    currency: region ? getCurrency(locale.maximize().region!)! : "USD",
  })

  const currencyParts = currencyFormat.formatToParts(demoNumber)

  return currencyParts.reduce(
    (acc, part, index) => {
      if (part.type === "group") {
        return {
          ...acc,
          group: part.value,
        }
      }
      if (part.type === "decimal") {
        return {
          ...acc,
          decimal: part.value,
        }
      }
      if (part.type === "currency") {
        return {
          ...acc,
          currency: part.value,
          currencyLeading: index === 0,
        }
      }
      return acc
    },
    { group: "", decimal: "", currency: "", currencyLeading: true },
  )
}

function getNumberSymbols(locale: Intl.Locale) {
  const demoNumber = 123456.789
  const numberFormat = new Intl.NumberFormat(locale)
  const numberParts = numberFormat.formatToParts(demoNumber)

  return numberParts.reduce(
    (acc, part) => {
      if (part.type === "group") {
        return {
          ...acc,
          group: part.value,
        }
      }
      if (part.type === "decimal") {
        return {
          ...acc,
          decimal: part.value,
        }
      }
      return acc
    },
    { group: "", decimal: "" },
  )
}

export function createReplacers(locale: Intl.Locale) {
  const maximizedLocale =
    // "ar".maximize() === "ar-EG", which to-words doesn't support
    locale.language === "ar" &&
    !["AE", "LB", "MA"].includes(locale.region ?? "")
      ? new Intl.Locale("ar-SA")
      : locale.maximize()

  const currencySymbols = getCurrencySymbols(maximizedLocale)

  const numeralRegexPart = `(\\p{Number}[\\p{Number}${currencySymbols.group}]*(?:[${currencySymbols.decimal}]\\p{Number}*)?)`
  const currencyRegex = currencySymbols.currencyLeading
    ? new RegExp(`[${currencySymbols.currency}]\\s?${numeralRegexPart}`, "gu")
    : new RegExp(`${numeralRegexPart}\\s?[${currencySymbols.currency}]`, "gu")

  function currencyReplacer(match: RegExpExecArray) {
    const numeralMatch = match[1]
    if (!numeralMatch) return match[0]

    const normalizedNumeral = numeralMatch
      .replaceAll(new RegExp(`\\${currencySymbols.group}`, "g"), "")
      .replace(new RegExp(`\\${currencySymbols.decimal}`), ".")
    const number = parseFloat(normalizedNumeral)

    if (Number.isNaN(number)) return match[0]

    try {
      return toWords(number, {
        localeCode: `${maximizedLocale.language}-${maximizedLocale.region}`,
        currency: true,
        doNotAddOnly: true,
      })
    } catch {
      return match[0]
    }
  }

  const numberSymbols = getNumberSymbols(maximizedLocale)

  const numberRegex = new RegExp(
    `(\\p{Number}[\\p{Number}${numberSymbols.group}]*(?:[${numberSymbols.decimal}]\\p{Number}*)?)`,
    "gu",
  )

  function numberReplacer(match: RegExpExecArray) {
    const numeralMatch = match[1]
    if (!numeralMatch) return match[0]

    const normalizedNumeral = numeralMatch
      .replaceAll(new RegExp(`\\${numberSymbols.group}`, "g"), "")
      .replace(new RegExp(`\\${numberSymbols.decimal}`), ".")
    const number = parseFloat(normalizedNumeral)

    if (Number.isNaN(number)) return match[0]

    try {
      return toWords(number, {
        localeCode: `${maximizedLocale.language}-${maximizedLocale.region}`,
      })
    } catch {
      return match[0]
    }
  }

  return [
    [currencyRegex, currencyReplacer] as [
      typeof currencyRegex,
      typeof currencyReplacer,
    ],
    [numberRegex, numberReplacer] as [
      typeof numberRegex,
      typeof numberReplacer,
    ],
  ]
}

export async function slugify(
  text: string,
  locale: Intl.Locale,
  separator = "-",
  useLocale = true,
  vocab?: Map<string, number>,
) {
  const replacers = replacerMap.get(locale) ?? createReplacers(locale)
  replacerMap.set(locale, replacers)

  let vocabChars = vocab ? vocabCharsMap.get(vocab) : undefined
  if (vocab && vocabChars?.locale !== locale.baseName) {
    const chars = Array.from(vocab.keys())
      .filter((c) => c !== "|")
      .flatMap((c) => [
        c.toLocaleLowerCase(locale),
        c.toLocaleUpperCase(locale),
      ])
    vocabChars = {
      locale: locale.baseName,
      chars,
      allowedChars: `a-zA-Z${chars.filter((c) => !/[a-zA-Z]/.test(c)).join("")}`,
    }
    vocabCharsMap.set(vocab, vocabChars)
  }

  const folded = vocab
    ? text.replace(/\p{Script=Han}/gu, (c) => {
        const simplified = traditionalToSimplified[c]
        return !vocab.has(c) && simplified && vocab.has(simplified)
          ? simplified
          : c
      })
    : text

  const chars = new Set(folded)
  if (vocabChars) {
    for (const [regex, replacer] of replacers) {
      for (const match of folded.matchAll(regex)) {
        for (const c of replacer(match)) {
          chars.add(c)
        }
      }
    }
  }
  const ignores = vocabChars?.chars.filter((c) => chars.has(c)) ?? []

  const { result, mapping } = await transliterateSlugify(folded, {
    allowedChars: vocabChars?.allowedChars ?? "a-zA-Z",
    replace: replacers,
    separator,
    ignore: ignores,
    ...(useLocale ? { locale } : {}),
  })

  return { result, mapping }
}

/**
 * Map the offsets of `words` through `mapping` into inclusive character
 * ranges of the slugified sentence, offset by `slugStart`.
 */
export function slugifiedWordRanges(
  words: WordEntry[],
  mapping: Mapping,
  sentenceStart: number,
  slugStart: number,
): [number, number][] {
  const cursor = mapping.cursor()

  return words
    .filter((word) => !word.isPunctuation)
    .map<[number, number]>((word) => {
      const start = cursor.map(word.startOffset - sentenceStart)
      const end = Math.max(
        cursor.map(word.endOffset - sentenceStart, "end") - 1,
        start,
      )

      return [start + slugStart, end + slugStart]
    })
}
