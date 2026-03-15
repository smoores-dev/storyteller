import { getCurrency } from "locale-currency"
import { toWords } from "to-words"

import { slugify as transliterateSlugify } from "@storyteller-platform/transliteration"

const replacerMap = new WeakMap<
  Intl.Locale,
  ReturnType<typeof createReplacers>
>()

function createReplacers(locale: Intl.Locale) {
  const maximizedLocale = locale.maximize()

  const demoNumber = 123456.789
  const currencyFormat = new Intl.NumberFormat(locale, {
    style: "currency",
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    currency: getCurrency(locale.maximize().region!)!,
  })

  const currencyParts = currencyFormat.formatToParts(demoNumber)

  const currencySymbols = currencyParts.reduce(
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

    return toWords(number, {
      localeCode: `${maximizedLocale.language}-${maximizedLocale.region}`,
      currency: true,
      doNotAddOnly: true,
    })
  }

  const numberFormat = new Intl.NumberFormat(locale)
  const numberParts = numberFormat.formatToParts(demoNumber)

  const numberSymbols = numberParts.reduce(
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

    return toWords(number, {
      localeCode: `${maximizedLocale.language}-${maximizedLocale.region}`,
    })
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

export async function slugify(text: string, locale: Intl.Locale) {
  const replacers = replacerMap.get(locale) ?? createReplacers(locale)
  replacerMap.set(locale, replacers)

  const { result, mapping } = await transliterateSlugify(text, {
    allowedChars: "a-zA-Z0-9",
    replace: replacers,
  })
  return { result, mapping }
}
