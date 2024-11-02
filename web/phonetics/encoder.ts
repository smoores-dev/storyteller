import { CharBuffer } from "./buffer.js"
import {
  BmpmRules,
  DestRule,
  DestRuleMatch,
  DestRulePhonetic,
  Lang,
} from "./rules.js"

type RuleSet = {
  main: DestRule[]
  final1: DestRule[]
  final2: DestRule[]
  discards: string[]
}

export enum Accuracy {
  APPROX = "APPROX",
  EXACT = "EXACT",
}

function getRules(accuracy: Accuracy, language: Lang) {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const main = BmpmRules.rules[language]!

  const [final1, final2] =
    accuracy === Accuracy.APPROX
      ? [
          BmpmRules.finalRules.approx.first,
          BmpmRules.finalRules.approx.second.find(
            ({ lang }) => lang === language,
          )?.rules ?? [],
        ]
      : [
          BmpmRules.finalRules.exact.first,
          BmpmRules.finalRules.exact.second.find(
            ({ lang }) => lang === language,
          )?.rules ?? [],
        ]

  return { main, final1, final2 }
}

const FIRST_LIST = ["de la", "van der", "van den"]

function prepareInput(input: string) {
  input = input.toLowerCase().trim()

  // remove spaces from within certain leading words
  for (const item of FIRST_LIST) {
    const target = item + " "
    if (input.slice(0, item.length + 1) === target) {
      input = item.replaceAll(" ", "") + input.slice(item.length)
    }
  }

  input = input.replaceAll("'", "")

  // remove all apostrophoes, dashes, and spaces, replacing the first instance of each with a space
  const toRemove = ["'", "-", " "]
  for (const target of toRemove) {
    const first = input.indexOf(target)
    if (first !== -1) {
      input = input.replaceAll(target, "")
      input = input.slice(0, first) + " " + input.slice(first)
    }
  }

  return input
}

type Token = {
  id: number
  langs: Lang
}

type Tokens = {
  items: Token[]
  buffer: CharBuffer
}

function containsAt(haystack: string, needle: string, index: number) {
  if (needle.length === 0) {
    return haystack.length === 0
  }

  if (haystack.length < index - 1) {
    return false
  }

  let matchCount = 0

  let start = index
  if (index < 0) {
    start = 0
  }
  for (let i = start; i < haystack.length; i++) {
    if (needle[matchCount] === haystack[i]) {
      matchCount++
    } else if (index < 0) {
      matchCount = 0
    } else {
      break
    }
    if (matchCount >= needle.length) {
      return true
    }
    continue
  }

  return false
}

function contains(haystack: string, needle: string) {
  return containsAt(haystack, needle, -1)
}

function matchRule(ruleMatch: DestRuleMatch, input: string) {
  if (ruleMatch.matchEmptyString && input.length === 0) {
    return true
  }

  if (ruleMatch.contains.length) {
    for (const i of ruleMatch.contains) {
      if (contains(input, i)) return true
    }
    return false
  }

  if (ruleMatch.exact.length) {
    for (const i of ruleMatch.exact) {
      if (i === input) return true
    }
    return false
  }

  if (ruleMatch.prefix.length) {
    for (const i of ruleMatch.prefix) {
      if (input.startsWith(i)) return true
    }
    return false
  }

  if (ruleMatch.suffix.length) {
    for (const i of ruleMatch.suffix) {
      if (input.endsWith(i)) return true
    }
    return false
  }

  if (ruleMatch.pattern) {
    return ruleMatch.pattern.test(input)
  }

  return false
}

function applyRuleTo(rule: DestRule, input: string, position: number) {
  const offset = 1

  if (rule.phoneticRules.length === 0) {
    return { result: [], offset }
  }

  if (rule.pattern.length > input.length - position) {
    return { result: [], offset }
  }

  if (!containsAt(input, rule.pattern, position)) {
    return { result: [], offset }
  }

  if (
    rule.rightContext &&
    !matchRule(rule.rightContext, input.slice(position + rule.pattern.length))
  ) {
    return { result: [], offset }
  }

  if (
    rule.leftContext &&
    !matchRule(rule.leftContext, input.slice(0, position))
  ) {
    return { result: [], offset }
  }

  return { result: rule.phoneticRules, offset: rule.pattern.length }
}

function mergeRulesToTokens(
  tokens: Tokens,
  rules: DestRulePhonetic[],
  lang: Lang,
) {
  if (rules.length === 0) {
    return
  }

  const initialLength = tokens.items.length
  for (let i = 0; i < initialLength; i++) {
    for (const rule of rules) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const copyId = tokens.buffer.copy(tokens.items[i]!.id)
      tokens.buffer.append(copyId, rule.text)
      tokens.items.push({ id: copyId, langs: lang })
    }
  }

  tokens.items.splice(0, initialLength)
}

function applyRules(
  rules: DestRule[],
  input: Tokens,
  lang: Lang,
  ignoreLangs: boolean,
): Tokens {
  if (rules.length == 0) {
    return input
  }

  const items: Token[] = []
  for (const token of input.items) {
    const item = input.buffer.get(token.id)

    const id = input.buffer.addWithSpace("", item.length)
    const newToken = { id, langs: token.langs }
    const newTokens = { buffer: input.buffer, items: [newToken] }
    for (let j = 0; j < item.length; ) {
      let applied = false
      let offset = 0

      for (const rule of rules) {
        const { result: tmp, offset: newOffset } = applyRuleTo(rule, item, j)
        offset = newOffset
        if (tmp.length > 0) {
          applied = true
          if (newTokens.items.length === 0) {
            newTokens.items.push(
              ...tmp.map(({ text, langs }) => ({
                id: newTokens.buffer.add(text),
                langs,
              })),
            )
          } else {
            mergeRulesToTokens(newTokens, tmp, lang)
          }
          break
        }
      }
      if (!applied) {
        for (const token of newTokens.items) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          newTokens.buffer.append(token.id, item[j]!)
        }
      }
      j += offset
    }

    items.push(...newTokens.items)
  }

  if (ignoreLangs) {
    for (const item of items) {
      item.langs = 1
    }
  }

  return {
    buffer: input.buffer,
    items,
  }
}

function makeTokens(
  input: string,
  accuracy: Accuracy,
  ruleset: RuleSet,
  lang: Lang,
  buffer: CharBuffer,
): Tokens {
  input = prepareInput(input)

  const [word1, word2] = input.split(" ")
  if (word1 !== undefined && word2 !== undefined) {
    const items = []
    if (!ruleset.discards.includes(word1)) {
      items.push(...makeTokens(word1, accuracy, ruleset, lang, buffer).items)
    }
    items.push(...makeTokens(word2, accuracy, ruleset, lang, buffer).items)
    items.push(
      ...makeTokens(word1 + word2, accuracy, ruleset, lang, buffer).items,
    )
    return {
      items,
      buffer,
    }
  }

  let result: Tokens = {
    items: [
      {
        id: buffer.add(input),
        langs: lang,
      },
    ],
    buffer,
  }

  result = applyRules(ruleset.main, result, lang, false)
  result = applyRules(ruleset.final1, result, lang, false)
  result = applyRules(ruleset.final2, result, lang, true)

  return result
}

export class Encoder {
  constructor(
    private accuracy = Accuracy.APPROX,
    private language: number,
    // private useBufferStorage = false,
  ) {}

  encode(input: string) {
    const { main, final1, final2 } = getRules(this.accuracy, this.language)

    const buffer = new CharBuffer(200)

    const ruleset = {
      main,
      final1,
      final2,
      discards: BmpmRules.discards,
    }

    const tokens = makeTokens(
      input,
      this.accuracy,
      ruleset,
      this.language,
      buffer,
    )

    return tokens.items.map((token) => tokens.buffer.get(token.id))
  }
}
