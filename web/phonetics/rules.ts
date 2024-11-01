import { parse } from "./regexParser"
import rulesJson from "./rules.json"

export type Lang = number

type SourceRule = { patterns: [string, string, string, string] }

type SourceSecondFinalRule = Array<{
  lang: number
  rules: SourceRule[]
}>

type SourceFinalRules = { first: SourceRule[]; second: SourceSecondFinalRule }

export type DestFinalRules = {
  first: DestRule[]
  second: {
    lang: Lang
    rules: DestRule[]
  }[]
}

export type DestRuleMatch = {
  matchEmptyString: boolean
  pattern: RegExp | null
  exact: string[]
  prefix: string[]
  suffix: string[]
  contains: string[]
}

export type DestRulePhonetic = {
  text: string
  langs: Lang
}

export type DestRule = {
  pattern: string
  leftContext: DestRuleMatch | null
  rightContext: DestRuleMatch | null
  phonetic: string
  phoneticRules: DestRulePhonetic[]
}

function parsePhoneticRule(src: string): DestRulePhonetic {
  let source = src
  let langs: Lang = -1
  const start = source.indexOf("[")
  if (start !== -1) {
    const end = source.indexOf("]")
    if (end === -1) {
      throw new Error(
        `invalid rule ${source}: must contain closing bracket "]"`,
      )
    }

    const l = parseInt(source.slice(start + 1, end), 10)
    if (Number.isNaN(l)) {
      throw new Error(
        `invalid rule ${source}: unable to parse lang attribute as an integer`,
      )
    }
    langs = l
    source = src.slice(0, start)
  }

  return {
    text: source,
    langs,
  }
}

function parsePhoneticRules(src: string) {
  let source = src
  if (!source.includes("(")) {
    return [parsePhoneticRule(source)]
  }

  if (!source.includes(")")) {
    throw new Error(`invalid rule ${source}: must contain closing bracket`)
  }

  source = src.slice(1, -1)
  const parts = src.split("|")
  return parts.map((part) => parsePhoneticRule(part))
}

function parsePattern(pattern: string) {
  const result: DestRuleMatch = {
    contains: [],
    exact: [],
    matchEmptyString: false,
    pattern: null,
    prefix: [],
    suffix: [],
  }

  const parsed = parse(pattern)
  if (parsed === null) {
    result.pattern = new RegExp(pattern)
    return result
  }

  if (parsed.items.length === 0) {
    result.matchEmptyString = true
    return result
  }

  if (parsed.isPrefix) {
    result.prefix = parsed.items
    return result
  }

  if (parsed.isSuffix) {
    result.suffix = parsed.items
    return result
  }

  if (parsed.isExact) {
    result.exact = parsed.items
    return result
  }

  result.contains = parsed.items
  return result
}

function destRuleMatchIsEmpty(m: DestRuleMatch) {
  return (
    !m.contains.length &&
    !m.prefix.length &&
    !m.suffix.length &&
    !m.exact.length &&
    !m.pattern &&
    !m.matchEmptyString
  )
}

function parseRule(source: { patterns: [string, string, string, string] }) {
  const result: DestRule = {
    pattern: source.patterns[0],
    phonetic: source.patterns[3],
    phoneticRules: parsePhoneticRules(source.patterns[3]),
    leftContext: null,
    rightContext: null,
  }

  let l = ""
  if (source.patterns[1] !== "") {
    l = source.patterns[1] + "$"
  }
  const lm = parsePattern(l)
  if (!destRuleMatchIsEmpty(lm)) {
    result.leftContext = lm
  }

  let r = ""
  if (source.patterns[2] !== "") {
    r = "^" + source.patterns[2]
  }
  const rm = parsePattern(r)
  if (!destRuleMatchIsEmpty(rm)) {
    result.rightContext = rm
  }

  return result
}

function parseRules(rules: Array<SourceRule>) {
  return rules.map((rule) => parseRule(rule))
}

function parseFinalRule(source: SourceFinalRules): DestFinalRules {
  return {
    first: parseRules(source.first),
    second: source.second.map(({ lang, rules }) => ({
      lang,
      rules: parseRules(rules),
    })),
  }
}

export const BmpmRules = {
  rules: Object.fromEntries(
    Object.entries(rulesJson.rules).map(([langName, rules]) => {
      const langIndex = rulesJson.languages.indexOf(langName)
      return [
        langIndex,
        parseRules(
          rules as Array<{
            patterns: [string, string, string, string]
          }>,
        ),
      ]
    }),
  ),
  finalRules: {
    approx: parseFinalRule(rulesJson.finalRules.approx as SourceFinalRules),
    exact: parseFinalRule(rulesJson.finalRules.exact as SourceFinalRules),
  },
  langRules: rulesJson.langRules.map(({ langs, accept, pattern }) => ({
    langs,
    accept,
    match: parsePattern(pattern),
  })),
  discards: rulesJson.discards,
}
