/**
 * The selector subset crengine understands, matched against a DOM.
 *
 * The accepted syntax follows crengine's parser (`lvstsheet.cpp:7340`, pseudo-class table at
 * `lvstsheet.cpp:278`): `*`, type selectors, `#id`, `.class`, attribute selectors, the
 * descendant, `>`, `+` and `~` combinators, and the pseudo-classes
 *
 * ```text
 * :root :first-child :last-child :only-child :empty
 * :first-of-type :last-of-type :only-of-type
 * :nth-child() :nth-of-type() :nth-last-child() :nth-last-of-type()
 * :is() :where() :not()
 * ```
 *
 * A construct outside that set — `:dir()`, `:lang()`, `:hover`, `:has()`, a malformed compound,
 * a namespace prefix — makes the selector unparseable, and an unparseable selector matches
 * nothing, which is what crengine does with it. Pseudo-elements describe generated content,
 * which this library does not model, so `::before` never matches an element either.
 */
import type { Element } from "./dom.ts"
import { isElementNode, nodeName } from "./nodes.ts"

/** What connects a compound to the compound on its left. */
type Combinator = "descendant" | "child" | "next" | "later"

type Attribute = { name: string; value: string | null }

type Pseudo =
  | { kind: "root" | "first-child" | "last-child" | "only-child" | "empty" }
  | {
      kind: "first-of-type" | "last-of-type" | "only-of-type"
    }
  | {
      kind: "nth-child" | "nth-last-child" | "nth-of-type" | "nth-last-of-type"
      a: number
      b: number
    }
  | { kind: "is" | "where" | "not"; selectors: SelectorImpl[] }

/** A compound selector: one element, with everything stuck to it. */
type Compound = {
  name: string | null
  ids: string[]
  classes: string[]
  attributes: Attribute[]
  pseudos: Pseudo[]
}

type Step = { combinator: Combinator; compound: Compound }

/** A parsed selector, with the specificity crengine ranks rules by. */
export type Selector = {
  readonly specificity: readonly [number, number, number]
  matches(element: Element): boolean
}

/** The same, with the parsed form visible for specificity arithmetic. */
type SelectorImpl = Selector & { steps: Step[] }

const KEYWORD_PSEUDOS = new Set([
  "root",
  "first-child",
  "last-child",
  "only-child",
  "empty",
  "first-of-type",
  "last-of-type",
  "only-of-type",
])

const NTH_PSEUDOS = new Set([
  "nth-child",
  "nth-last-child",
  "nth-of-type",
  "nth-last-of-type",
])

const FUNCTION_PSEUDOS = new Set(["is", "where", "not"])

/**
 * Parse one selector. `null` means "not understood", and callers must then drop the rule —
 * crengine drops the whole rule when it cannot parse one selector of the list.
 */
export function parseSelector(text: string): SelectorImpl | null {
  const steps = parseComplex(text.trim())
  if (steps === null) return null
  const specificity = specificityOf(steps)
  return {
    specificity,
    matches: (element: Element): boolean =>
      matchStep(steps, steps.length - 1, element),
    steps,
  }
}

function specificityOf(steps: Step[]): [number, number, number] {
  let ids = 0
  let rest = 0
  let types = 0
  for (const step of steps) {
    ids += step.compound.ids.length
    rest += step.compound.classes.length + step.compound.attributes.length
    if (step.compound.name !== null) types += 1
    for (const pseudo of step.compound.pseudos) {
      if (pseudo.kind === "is" || pseudo.kind === "not") {
        // :not() counts its argument, :is() the most specific of its list; both are the same
        // rule applied to a list of one for :not().
        for (const inner of pseudo.selectors) {
          const inner2 = specificityOf(inner.steps)
          ids += inner2[0]
          rest += inner2[1]
          types += inner2[2]
        }
      } else if (pseudo.kind !== "where") {
        rest += 1
      }
    }
  }
  return [ids, rest, types]
}

/** Compare specificity, as CSS does: id, then class-level, then type. */
export function compareSpecificity(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  for (let index = 0; index < 3; index++) {
    if (a[index] !== b[index]) return (a[index] ?? 0) < (b[index] ?? 0) ? -1 : 1
  }
  return 0
}

function parseComplex(text: string): Step[] | null {
  const steps: Step[] = []
  let combinator: Combinator = "descendant"
  let index = 0
  while (index < text.length) {
    const char = text[index]
    if (char === " " || char === "\t" || char === "\n" || char === ">") {
      if (char === ">") combinator = "child"
      else if (combinator === "descendant" && steps.length > 0 && index > 0) {
        // Keep the descendant combinator; a following +/~ overwrites it below.
      }
      index++
      continue
    }
    if (char === "+" || char === "~") {
      combinator = char === "+" ? "next" : "later"
      index++
      continue
    }
    const end = compoundEnd(text, index)
    const compound = parseCompound(text.slice(index, end))
    if (compound === null) return null
    steps.push({ combinator, compound })
    combinator = "descendant"
    index = end
  }
  return steps.length === 0 ? null : steps
}

/** Where the compound starting at `from` ends: the next top-level combinator or space. */
function compoundEnd(text: string, from: number): number {
  let depth = 0
  let quote = ""
  for (let index = from; index < text.length; index++) {
    const char = text[index]
    if (quote !== "") {
      if (char === quote) quote = ""
      continue
    }
    if (char === '"' || char === "'") quote = char
    else if (char === "(" || char === "[") depth++
    else if (char === ")" || char === "]") depth--
    else if (
      depth === 0 &&
      (char === " " ||
        char === "\t" ||
        char === "\n" ||
        char === ">" ||
        char === "+" ||
        char === "~")
    ) {
      return index
    }
  }
  return text.length
}

const NAME = /^[*]?[A-Za-z_][\w-]*/

function parseCompound(text: string): Compound | null {
  const compound: Compound = {
    name: null,
    ids: [],
    classes: [],
    attributes: [],
    pseudos: [],
  }
  let index = 0
  if (text.startsWith("*")) {
    index = 1
  } else {
    const name = NAME.exec(text)
    if (name !== null) {
      if (name[0].includes("|")) return null // namespaced: crengine matches local names only
      compound.name = name[0].toLowerCase()
      index = name[0].length
    }
  }
  while (index < text.length) {
    const char = text[index]
    if (char === "#") {
      const match = /^#([\w-]+)/.exec(text.slice(index))
      const id = match === null ? undefined : match[1]
      if (match === null || id === undefined) return null
      compound.ids.push(id)
      index += match[0].length
      continue
    }
    if (char === ".") {
      const match = /^\.([\w-]+)/.exec(text.slice(index))
      const klass = match === null ? undefined : match[1]
      if (match === null || klass === undefined) return null
      compound.classes.push(klass)
      index += match[0].length
      continue
    }
    if (char === "[") {
      const end = text.indexOf("]", index)
      if (end === -1) return null
      const attribute = parseAttribute(text.slice(index + 1, end))
      if (attribute === null) return null
      compound.attributes.push(attribute)
      index = end + 1
      continue
    }
    if (char === ":") {
      const parsed = parsePseudo(text, index)
      if (parsed === null) return null
      compound.pseudos.push(parsed.pseudo)
      index = parsed.next
      continue
    }
    return null
  }
  return compound
}

function parseAttribute(text: string): Attribute | null {
  const match = /^\s*([\w-]+)\s*(?:=\s*(.*?))?\s*$/.exec(text)
  if (match === null || match[1] === undefined) return null
  // Only the exact `attr=value` form: crengine's parser recognises the other operators, and
  // books use them for `type` and `lang` where an exact match would be wrong, so a~=b and
  // friends are treated as not understood rather than guessed at.
  const raw = match[2]
  if (raw === undefined) return { name: match[1].toLowerCase(), value: null }
  if (
    raw.includes("~") ||
    raw.includes("|") ||
    raw.includes("^") ||
    raw.includes("$")
  )
    return null
  return {
    name: match[1].toLowerCase(),
    value: raw.replace(/^["']|["']$/g, ""),
  }
}

/** Parse from `index` (a `:`); `null` for pseudo-elements and anything unknown. */
function parsePseudo(
  text: string,
  index: number,
): { pseudo: Pseudo; next: number } | null {
  if (text[index + 1] === ":") return null
  const name = /^:([a-zA-Z-]+)/.exec(text.slice(index))
  if (name?.[1] === undefined) return null
  const kind = name[1].toLowerCase()
  let cursor = index + name[0].length
  const hasArgument = text[cursor] === "("
  if (KEYWORD_PSEUDOS.has(kind)) {
    if (hasArgument) return null
    return { next: cursor, pseudo: { kind } as Pseudo }
  }
  if (!hasArgument) return null
  const end = matchingParen(text, cursor)
  if (end === -1) return null
  const argument = text.slice(cursor + 1, end).trim()
  cursor = end + 1
  if (NTH_PSEUDOS.has(kind)) {
    const nth = nthArgument(argument)
    if (nth === null) return null
    return {
      next: cursor,
      pseudo: { kind, a: nth[0], b: nth[1] } as Pseudo,
    }
  }
  if (FUNCTION_PSEUDOS.has(kind)) {
    const selectors: SelectorImpl[] = []
    for (const part of splitTopLevel(argument)) {
      const selector = parseSelector(part)
      if (selector === null) return null
      selectors.push(selector)
    }
    if (selectors.length === 0) return null
    return { next: cursor, pseudo: { kind, selectors } as Pseudo }
  }
  return null
}

function matchingParen(text: string, open: number): number {
  let depth = 0
  for (let index = open; index < text.length; index++) {
    if (text[index] === "(") depth++
    else if (text[index] === ")") {
      depth--
      if (depth === 0) return index
    }
  }
  return -1
}

function splitTopLevel(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ""
  for (const char of text) {
    if (char === "(") depth++
    if (char === ")") depth--
    if (char === "," && depth === 0) {
      parts.push(current)
      current = ""
      continue
    }
    current += char
  }
  parts.push(current)
  return parts.map((part) => part.trim()).filter((part) => part.length > 0)
}

/** `an+b`, `odd`, `even` or a plain integer, as `[a, b]`. */
export function nthArgument(text: string): [number, number] | null {
  const value = text.trim().toLowerCase().replace(/\s+/g, "")
  if (value === "odd") return [2, 1]
  if (value === "even") return [2, 0]
  const linear = /^([+-]?\d*)n([+-]\d+)?$/.exec(value)
  if (linear !== null) {
    const a =
      linear[1] === "" || linear[1] === "+"
        ? 1
        : linear[1] === "-"
          ? -1
          : Number(linear[1])
    return [a, Number(linear[2] ?? 0)]
  }
  const alone = /^[+-]?\d+$/.exec(value)
  if (alone !== null) return [0, Number(value)]
  return null
}

/** Match `steps[0..index]` with `steps[index]` anchored at `element`. */
function matchStep(steps: Step[], index: number, element: Element): boolean {
  const step = steps[index]
  if (step === undefined) return true
  if (!matchesCompound(element, step.compound)) return false
  if (index === 0) return true
  const earlier = steps.slice(0, index)
  const rest = index - 1
  switch (step.combinator) {
    case "descendant": {
      let parent = element.parentNode
      while (parent !== null && isElementNode(parent)) {
        if (matchStep(earlier, rest, parent)) return true
        parent = parent.parentNode
      }
      return false
    }
    case "child": {
      const parent = element.parentNode
      return parent !== null && isElementNode(parent)
        ? matchStep(earlier, rest, parent)
        : false
    }
    case "next": {
      const sibling = previousElement(element)
      return sibling === null ? false : matchStep(earlier, rest, sibling)
    }
    case "later": {
      let sibling = previousElement(element)
      while (sibling !== null) {
        if (matchStep(earlier, rest, sibling)) return true
        sibling = previousElement(sibling)
      }
      return false
    }
  }
}

function matchesCompound(element: Element, compound: Compound): boolean {
  if (compound.name !== null && nodeName(element) !== compound.name)
    return false
  for (const id of compound.ids)
    if (element.getAttribute("id") !== id) return false
  if (compound.classes.length > 0) {
    const classes = classList(element)
    for (const klass of compound.classes)
      if (!classes.includes(klass)) return false
  }
  for (const attribute of compound.attributes) {
    const value = element.getAttribute(attribute.name)
    if (value === null) return false
    if (attribute.value !== null && value !== attribute.value) return false
  }
  for (const pseudo of compound.pseudos) {
    if (!matchesPseudo(element, pseudo)) return false
  }
  return true
}

function matchesPseudo(element: Element, pseudo: Pseudo): boolean {
  switch (pseudo.kind) {
    case "root":
      return element.parentNode?.nodeType === 9
    case "first-child":
      return elementSiblings(element)[0] === element
    case "last-child":
      return last(elementSiblings(element)) === element
    case "only-child":
      return elementSiblings(element).length === 1
    case "empty":
      return element.firstChild === null
    case "first-of-type":
      return sameType(element)[0] === element
    case "last-of-type":
      return last(sameType(element)) === element
    case "only-of-type":
      return sameType(element).length === 1
    case "nth-child":
      return matchesNth(pseudo, elementSiblings(element).indexOf(element) + 1)
    case "nth-last-child": {
      const siblings = elementSiblings(element)
      return matchesNth(pseudo, siblings.length - siblings.indexOf(element))
    }
    case "nth-of-type":
      return matchesNth(pseudo, sameType(element).indexOf(element) + 1)
    case "nth-last-of-type": {
      const same = sameType(element)
      return matchesNth(pseudo, same.length - same.indexOf(element))
    }
    case "not":
      return !pseudo.selectors.some((selector) => selector.matches(element))
    case "is":
    case "where":
      return pseudo.selectors.some((selector) => selector.matches(element))
  }
}

function matchesNth(pseudo: { a: number; b: number }, index: number): boolean {
  if (pseudo.a === 0) return index === pseudo.b
  const offset = index - pseudo.b
  return offset % pseudo.a === 0 && offset / pseudo.a >= 0
}

function elementSiblings(element: Element): Element[] {
  const parent = element.parentNode
  if (parent === null) return [element]
  const out: Element[] = []
  for (
    let child = parent.firstChild;
    child !== null;
    child = child.nextSibling
  ) {
    if (isElementNode(child)) out.push(child)
  }
  return out
}

function sameType(element: Element): Element[] {
  const name = nodeName(element)
  return elementSiblings(element).filter(
    (sibling) => nodeName(sibling) === name,
  )
}

function previousElement(element: Element): Element | null {
  let sibling = element.previousSibling
  while (sibling !== null && !isElementNode(sibling))
    sibling = sibling.previousSibling
  return sibling === null ? null : sibling
}

function classList(element: Element): string[] {
  const value = element.getAttribute("class")
  return value === null
    ? []
    : value.split(/\s+/).filter((part) => part.length > 0)
}

function last<T>(list: T[]): T | undefined {
  return list[list.length - 1]
}
